// Copyright (c) 2022, Frappe and contributors
// For license information, please see license.txt

frappe.ui.form.on("LMS Batch", {
	onload: function (frm) {
		frm.set_query("student", "students", function (doc) {
			return {
				filters: {
					ignore_user_type: 1,
				},
			};
		});

		frm.set_query("reference_doctype", "timetable", function () {
			let doctypes = ["Course Lesson", "LMS Quiz", "LMS Assignment"];
			return {
				filters: {
					name: ["in", doctypes],
				},
			};
		});

		frm.set_query("assessment_type", "assessment", function () {
			let doctypes = ["LMS Quiz", "LMS Assignment"];
			return {
				filters: {
					name: ["in", doctypes],
				},
			};
		});

		frm.set_query("reference_doctype", "timetable_legends", function () {
			let doctypes = ["Course Lesson", "LMS Quiz", "LMS Assignment"];
			return {
				filters: {
					name: ["in", doctypes],
				},
			};
		});

		if (frm.doc.timetable.length && !frm.doc.timetable_legends.length) {
			set_default_legends(frm);
		}
	},

	timetable_template: function (frm) {
		set_timetable(frm);
	},

	refresh: (frm) => {
		frm.add_web_link(
			`/lms/batches/details/${frm.doc.name}`,
			__("See on website")
		);

		if (!frm.is_new()) {
			frm.add_custom_button(__("Enroll Student Groups"), function () {
				show_student_group_selection_dialog(frm);
			});
		}
	},
});

function show_student_group_selection_dialog(frm) {
	frappe.call({
		method: "frappe.client.get_list",
		args: {
			doctype: "Student Group",
			fields: ["name", "program", "academic_term", "academic_year"],
			limit_page_length: 999,
		},
		callback: function (r) {
			if (r.message && r.message.length > 0) {
				show_group_selection_dialog(frm, r.message);
			} else {
				frappe.msgprint(__("No student groups found"));
			}
		},
	});
}

function show_group_selection_dialog(frm, groups) {
	let dialog = new frappe.ui.Dialog({
		title: __("Select Student Groups to Enroll"),
		fields: [
			{
				fieldname: "groups_html",
				fieldtype: "HTML",
			},
		],
		primary_action_label: __("Enroll Selected"),
		primary_action: function () {
			let selected_groups = [];
			dialog.$wrapper.find('input[type="checkbox"]:checked').each(function () {
				let val = $(this).val();
				if (val && val !== "on") {
					selected_groups.push(val);
				}
			});

			if (selected_groups.length === 0) {
				frappe.msgprint(__("Please select at least one student group"));
				return;
			}

			dialog.hide();

			frappe.confirm(
				__(
					"Enroll students from {0} group(s) in this batch?",
					[selected_groups.length]
				),
				function () {
					enroll_student_groups_in_batch(frm, selected_groups);
				}
			);
		},
	});

	const searchPlaceholder = __("Search by group name...");
	const nameLabel = __("Student Group Name");
	const programLabel = __("Program");

	let html = `
		<div class="form-group">
			<input type="text"
				   id="group_search"
				   class="form-control"
				   placeholder="${searchPlaceholder}"
				   style="margin-bottom: 15px;">
		</div>
		<div style="max-height: 400px; overflow-y: auto;">
			<table class="table table-bordered" id="groups_table">
				<thead>
					<tr>
						<th width="50"><input type="checkbox" id="select_all_groups"></th>
						<th>${nameLabel}</th>
						<th>${programLabel}</th>
					</tr>
				</thead>
				<tbody>
	`;

	groups.forEach(function (group) {
		html += `
			<tr class="group-row">
				<td><input type="checkbox" class="group-checkbox" value="${group.name}"></td>
				<td>${group.name}</td>
				<td>${group.program || ""}</td>
			</tr>
		`;
	});

	html += `
				</tbody>
			</table>
		</div>
	`;

	dialog.fields_dict.groups_html.$wrapper.html(html);

	dialog.$wrapper.find("#select_all_groups").on("change", function () {
		dialog
			.$wrapper.find(".group-row:visible .group-checkbox")
			.prop("checked", $(this).is(":checked"));
	});

	dialog.$wrapper.find("#group_search").on("keyup", function () {
		let search_term = $(this).val().toLowerCase();

		dialog.$wrapper.find(".group-row").each(function () {
			let name = $(this).find("td:eq(1)").text().toLowerCase();
			let program = $(this).find("td:eq(2)").text().toLowerCase();

			if (name.includes(search_term) || program.includes(search_term)) {
				$(this).show();
			} else {
				$(this).hide();
			}
		});

		if (search_term) {
			dialog.$wrapper.find("#select_all_groups").prop("checked", false);
		}
	});

	dialog.show();
}

function enroll_student_groups_in_batch(frm, groups) {
	frappe.call({
		method: "lms.lms.doctype.lms_batch_enrollment.lms_batch_enrollment.enroll_student_groups",
		args: {
			batch: frm.doc.name,
			student_groups: groups,
		},
		freeze: true,
		freeze_message: __("Enrolling users..."),
		callback: function (r) {
			if (r.message) {
				let message = __("Enrollment completed successfully!") + "<br>";
				message += __("Created: {0} enrollments", [r.message.created]) + "<br>";
				message += __("Skipped: {0} (already enrolled)", [r.message.skipped]);

				frappe.msgprint({
					title: __("Enrollment Summary"),
					message: message,
					indicator: "green",
				});

				frm.reload_doc();
			}
		},
	});
}

const set_timetable = (frm) => {
	if (frm.doc.timetable_template) {
		frm.clear_table("timetable");
		frm.refresh_fields();

		frappe.call({
			method: "frappe.client.get_list",
			args: {
				doctype: "LMS Batch Timetable",
				parent: "LMS Timetable Template",
				fields: [
					"reference_doctype",
					"reference_docname",
					"day",
					"start_time",
					"end_time",
					"duration",
					"milestone",
				],
				filters: {
					parent: frm.doc.timetable_template,
					parenttype: "LMS Timetable Template",
				},
				order_by: "idx",
			},
			callback: (data) => {
				add_timetable_rows(frm, data.message);
			},
		});
	}
};

const add_timetable_rows = (frm, timetable) => {
	timetable.forEach((row) => {
		let child = frm.add_child("timetable");
		child.reference_doctype = row.reference_doctype;
		child.reference_docname = row.reference_docname;
		child.date = frappe.datetime.add_days(frm.doc.start_date, row.day - 1);
		child.start_time = row.start_time;
		child.end_time = row.end_time
			? row.end_time
			: row.duration
			? moment
					.utc(row.start_time, "HH:mm")
					.add(row.duration, "hour")
					.format("HH:mm")
			: null;
		child.duration = row.duration;
		child.milestone = row.milestone;
	});
	frm.refresh_field("timetable");

	set_legends(frm);
};

const set_legends = (frm) => {
	if (frm.doc.timetable_template) {
		frm.clear_table("timetable_legends");
		frm.refresh_fields();
		frappe.call({
			method: "frappe.client.get_list",
			args: {
				doctype: "LMS Timetable Legend",
				parent: "LMS Timetable Template",
				fields: ["reference_doctype", "label", "color"],
				filters: {
					parent: frm.doc.timetable_template,
					parenttype: "LMS Timetable Template",
				},
				order_by: "idx",
			},
			callback: (data) => {
				add_legend_rows(frm, data.message);
			},
		});
	}
};

const add_legend_rows = (frm, legends) => {
	legends.forEach((row) => {
		let child = frm.add_child("timetable_legends");
		child.reference_doctype = row.reference_doctype;
		child.label = row.label;
		child.color = row.color;
	});
	frm.refresh_field("timetable_legends");
	frm.save();
};

const set_default_legends = (frm) => {
	const data = [
		{
			reference_doctype: "Course Lesson",
			label: "Lesson",
			color: "#449CF0",
		},
		{
			reference_doctype: "LMS Quiz",
			label: "LMS Quiz",
			color: "#39E4A5",
		},
		{
			reference_doctype: "LMS Assignment",
			label: "LMS Assignment",
			color: "#ECAD4B",
		},
		{
			reference_doctype: "LMS Live Class",
			label: "LMS Live Class",
			color: "#bb8be8",
		},
	];

	data.forEach((detail) => {
		let child = frm.add_child("timetable_legends");
		child.reference_doctype = detail.reference_doctype;
		child.label = detail.label;
		child.color = detail.color;
	});
	frm.refresh_field("timetable_legends");
	frm.save();
};
