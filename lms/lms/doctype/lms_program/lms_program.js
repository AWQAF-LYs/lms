// Copyright (c) 2024, Frappe and contributors
// For license information, please see license.txt

frappe.ui.form.on("LMS Program", {
	refresh(frm) {
		if (!frm.is_new()) {
			frm.add_custom_button(__('Enroll Users'), function() {
				show_user_selection_dialog(frm);
			});
		}
	},
});

function show_user_selection_dialog(frm) {
	// Get already enrolled members to exclude from selection
	let enrolled_members = frm.doc.program_members.map(row => row.member);
	
	// Prepare exclusion list
	let excluded_users = ['Administrator', 'Guest'];
	if (enrolled_members && enrolled_members.length > 0) {
		excluded_users = excluded_users.concat(enrolled_members);
	}

	// Fetch users first
	frappe.call({
		method: 'frappe.client.get_list',
		args: {
			doctype: 'User',
			fields: ['name', 'full_name', 'email'],
			filters: {
				enabled: 1,
				name: ['not in', excluded_users]
			},
			limit_page_length: 999
		},
		callback: function(r) {
			if (r.message && r.message.length > 0) {
				show_selection_dialog(frm, r.message);
			} else {
				frappe.msgprint(__('No users found to enroll'));
			}
		}
	});
}

function show_selection_dialog(frm, users) {
	let dialog = new frappe.ui.Dialog({
		title: __('Select Users to Enroll'),
		fields: [
			{
				fieldname: 'users_html',
				fieldtype: 'HTML'
			}
		],
		primary_action_label: __('Enroll Selected'),
		primary_action: function() {
			let selected_users = [];
			dialog.$wrapper.find('input[type="checkbox"]:checked').each(function() {
				let val = $(this).val();
				if (val && val !== 'on') { // Exclude the select-all checkbox
					selected_users.push(val);
				}
			});
			
			if (selected_users.length === 0) {
				frappe.msgprint(__('Please select at least one user'));
				return;
			}

			dialog.hide();
			
			frappe.confirm(
				__('Enroll {0} user(s) in all courses of this program?', [selected_users.length]),
				function() {
					enroll_users_in_program(frm, selected_users);
				}
			);
		}
	});

	// Build HTML with search field and table
	const searchPlaceholder = __('Search by email or name...');
	const emailLabel = __('Email');
	const fullNameLabel = __('Full Name');
	
	let html = `
		<div class="form-group">
			<input type="text"
				   id="user_search"
				   class="form-control"
				   placeholder="${searchPlaceholder}"
				   style="margin-bottom: 15px;">
		</div>
		<div style="max-height: 400px; overflow-y: auto;">
			<table class="table table-bordered" id="users_table">
				<thead>
					<tr>
						<th width="50"><input type="checkbox" id="select_all_users"></th>
						<th>${emailLabel}</th>
						<th>${fullNameLabel}</th>
					</tr>
				</thead>
				<tbody>
	`;
	
	users.forEach(function(user) {
		html += `
			<tr class="user-row">
				<td><input type="checkbox" class="user-checkbox" value="${user.name}"></td>
				<td>${user.name}</td>
				<td>${user.full_name || ''}</td>
			</tr>
		`;
	});
	
	html += `
				</tbody>
			</table>
		</div>
	`;
	
	dialog.fields_dict.users_html.$wrapper.html(html);
	
	// Select all functionality
	dialog.$wrapper.find('#select_all_users').on('change', function() {
		// Only check visible rows
		dialog.$wrapper.find('.user-row:visible .user-checkbox').prop('checked', $(this).is(':checked'));
	});
	
	// Search functionality
	dialog.$wrapper.find('#user_search').on('keyup', function() {
		let search_term = $(this).val().toLowerCase();
		
		dialog.$wrapper.find('.user-row').each(function() {
			let email = $(this).find('td:eq(1)').text().toLowerCase();
			let name = $(this).find('td:eq(2)').text().toLowerCase();
			
			if (email.includes(search_term) || name.includes(search_term)) {
				$(this).show();
			} else {
				$(this).hide();
			}
		});
		
		// Uncheck select-all if search is active
		if (search_term) {
			dialog.$wrapper.find('#select_all_users').prop('checked', false);
		}
	});
	
	dialog.show();
}

function enroll_users_in_program(frm, users) {
	frappe.call({
		method: 'lms.lms.doctype.lms_program.lms_program.enroll_program_members',
		args: {
			program: frm.doc.name,
			members: users
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
