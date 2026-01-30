// Copyright (c) 2024, Frappe and contributors
// For license information, please see license.txt

frappe.ui.form.on("LMS Program", {
	refresh(frm) {
		if (!frm.is_new()) {
			frm.add_custom_button(__('Enroll Student Groups'), function() {
				show_student_group_selection_dialog(frm);
			});
		}
	},
});

function show_student_group_selection_dialog(frm) {
	// Fetch student groups
	frappe.call({
		method: 'frappe.client.get_list',
		args: {
			doctype: 'Student Group',
			fields: ['name', 'program', 'academic_term', 'academic_year'],
			limit_page_length: 999
		},
		callback: function(r) {
			if (r.message && r.message.length > 0) {
				show_group_selection_dialog(frm, r.message);
			} else {
				frappe.msgprint(__('No student groups found'));
			}
		}
	});
}

function show_group_selection_dialog(frm, groups) {
	let dialog = new frappe.ui.Dialog({
		title: __('Select Student Groups to Enroll'),
		fields: [
			{
				fieldname: 'groups_html',
				fieldtype: 'HTML'
			}
		],
		primary_action_label: __('Enroll Selected'),
		primary_action: function() {
			let selected_groups = [];
			dialog.$wrapper.find('input[type="checkbox"]:checked').each(function() {
				let val = $(this).val();
				if (val && val !== 'on') { // Exclude the select-all checkbox
					selected_groups.push(val);
				}
			});
			
			if (selected_groups.length === 0) {
				frappe.msgprint(__('Please select at least one student group'));
				return;
			}

			dialog.hide();
			
			frappe.confirm(
				__('Enroll students from {0} group(s) in all courses of this program?', [selected_groups.length]),
				function() {
					enroll_student_groups_in_program(frm, selected_groups);
				}
			);
		}
	});

	// Build HTML with search field and table
	const searchPlaceholder = __('Search by group name...');
	const nameLabel = __('Student Group Name');
	const programLabel = __('Program');
	
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
	
	groups.forEach(function(group) {
		html += `
			<tr class="group-row">
				<td><input type="checkbox" class="group-checkbox" value="${group.name}"></td>
				<td>${group.name}</td>
				<td>${group.program || ''}</td>
			</tr>
		`;
	});
	
	html += `
				</tbody>
			</table>
		</div>
	`;
	
	dialog.fields_dict.groups_html.$wrapper.html(html);
	
	// Select all functionality
	dialog.$wrapper.find('#select_all_groups').on('change', function() {
		// Only check visible rows
		dialog.$wrapper.find('.group-row:visible .group-checkbox').prop('checked', $(this).is(':checked'));
	});
	
	// Search functionality
	dialog.$wrapper.find('#group_search').on('keyup', function() {
		let search_term = $(this).val().toLowerCase();
		
		dialog.$wrapper.find('.group-row').each(function() {
			let name = $(this).find('td:eq(1)').text().toLowerCase();
			let program = $(this).find('td:eq(2)').text().toLowerCase();
			
			if (name.includes(search_term) || program.includes(search_term)) {
				$(this).show();
			} else {
				$(this).hide();
			}
		});
		
		// Uncheck select-all if search is active
		if (search_term) {
			dialog.$wrapper.find('#select_all_groups').prop('checked', false);
		}
	});
	
	dialog.show();
}

function enroll_student_groups_in_program(frm, groups) {
	frappe.call({
		method: 'lms.lms.doctype.lms_program.lms_program.enroll_student_groups',
		args: {
			program: frm.doc.name,
			student_groups: groups
		},
		freeze: true,
		freeze_message: __('Enrolling users...'),
		callback: function(r) {
			if (r.message) {
				let message = __('Enrollment completed successfully!<br>');
				message += __('Created: {0} enrollments<br>', [r.message.created]);
				message += __('Skipped: {0} (already enrolled)', [r.message.skipped]);
				
				frappe.msgprint({
					title: __('Enrollment Summary'),
					message: message,
					indicator: 'green'
				});
				
				frm.reload_doc();
			}
		}
	});
}
