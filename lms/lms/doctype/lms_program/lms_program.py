# Copyright (c) 2024, Frappe and contributors
# For license information, please see license.txt

import json

import frappe
from frappe import _
from frappe.model.document import Document


class LMSProgram(Document):
	def validate(self):
		self.validate_program_courses()
		self.validate_program_members()
		self.update_count()

	def validate_program_courses(self):
		courses = [row.course for row in self.program_courses]
		duplicates = {course for course in courses if courses.count(course) > 1}
		if len(duplicates):
			frappe.throw(
				_("Course {0} has already been added to this batch.").format(
					frappe.bold(next(iter(duplicates)))
				)
			)

	def validate_program_members(self):
		members = [row.member for row in self.program_members]
		duplicates = {member for member in members if members.count(member) > 1}
		if len(duplicates):
			frappe.throw(
				_("Member {0} has already been added to this batch.").format(
					frappe.bold(next(iter(duplicates)))
				)
			)

	def update_count(self):
		course_count = len(self.program_courses)
		member_count = len(self.program_members)

		if self.course_count != course_count:
			self.course_count = course_count

		if self.member_count != member_count:
			self.member_count = member_count


@frappe.whitelist()
def enroll_program_members(program, members):
	"""
	Enroll selected users in all courses of the program.
	Creates LMS Enrollment records for each user-course combination.
	"""
	if isinstance(members, str):
		members = json.loads(members)

	if not members:
		return {"created": 0, "skipped": 0}

	# Get program document and check permissions
	program_doc = frappe.get_doc("LMS Program", program)
	program_doc.check_permission("write")

	# Get all courses in the program
	courses = [row.course for row in program_doc.program_courses if row.course]
	if not courses:
		frappe.throw(_("Please add courses to the program before enrolling users."))

	# Get existing members to avoid duplicates in program_members
	existing_members = {row.member for row in program_doc.program_members if row.member}

	created = 0
	skipped = 0

	# Process each member
	for member in members:
		# Add member to program_members if not already added
		if member not in existing_members:
			program_doc.append("program_members", {"member": member})
			existing_members.add(member)

		# Create enrollment for each course
		for course in courses:
			# Check if enrollment already exists
			if frappe.db.exists("LMS Enrollment", {"course": course, "member": member}):
				skipped += 1
				continue

			# Create new enrollment
			enrollment = frappe.new_doc("LMS Enrollment")
			enrollment.update(
				{
					"course": course,
					"member": member,
					"member_type": "Student",
					"role": "Member",
				}
			)
			enrollment.insert(ignore_permissions=True)
			created += 1

	# Save program with new members
	program_doc.save(ignore_permissions=True)

	return {"created": created, "skipped": skipped}


@frappe.whitelist()
def enroll_student_groups(program, student_groups):
	if isinstance(student_groups, str):
		student_groups = json.loads(student_groups)

	if not student_groups:
		return {"created": 0, "skipped": 0}

	# Get students from groups
	students = frappe.get_all(
		"Student Group Student", filters={"parent": ["in", student_groups]}, pluck="student"
	)

	if not students:
		return {"created": 0, "skipped": 0}

	# Determine the correct field for User ID
	student_meta = frappe.get_meta("Student")
	user_field = "user_id" if student_meta.has_field("user_id") else "student_email_id"

	# Fetch users for students
	users = frappe.get_all(
		"Student",
		filters={"name": ["in", students], user_field: ["is", "set"]},
		pluck=user_field,
	)

	# Filter out any potential None values and duplicates
	users = list(set(filter(None, users)))

	return enroll_program_members(program, users)
