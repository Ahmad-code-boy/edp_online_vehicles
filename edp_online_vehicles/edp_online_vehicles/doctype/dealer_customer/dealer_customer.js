// Copyright (c) 2024, NexTash and contributors
// For license information, please see license.txt

frappe.ui.form.on("Dealer Customer", {
	refresh(frm) {
		// Trigger ID number validation and age calculation on blur
		$(frm.fields_dict["id_no"].input).on("blur", function () {
			validate_id_no(frm);
		});

		// Trigger email validation on blur
		$(frm.fields_dict["email"].input).on("blur", function () {
			validate_email(frm);
		});

		if (frm.doc.country) {
			frappe.call({
				method: "edp_online_vehicles.events.get_country_doc.get_country_doc",
				args: {
					country: frm.doc.country,
				},
				callback: function (r) {
					if (r.message) {
						var country_data = r.message;

						var region_options = [];

						(country_data.custom_regions || []).forEach(
							function (regions_row) {
								region_options.push({
									label: regions_row.region,
									value: regions_row.region,
								});
							},
						);

						var field = frm.fields_dict.province_state;
						field.df.options = region_options
							.map((option) => option.value)
							.join("\n");

						field.refresh();
					}
				},
			});
		}
	},

	onload(frm) {
		if (!frm.is_new()) {
			frappe.call({
				method: "edp_online_vehicles.events.get_cust_vehicles.get_vehicles_linked_to_dealer_cust",
				args: {
					docname: frm.doc.name,
				},
				callback: function (r) {
					if (r.message) {
						// Convert current child table data to a comparable format
						let currentVehicles =
							frm.doc.vehicles_linked_to_customer.map(
								(vehicle) => ({
									vin_serial_no: vehicle.vin_serial_no,
									description: vehicle.description,
									colour: vehicle.colour,
									warranty_end_date:
										vehicle.warranty_end_date,
									service_end_date: vehicle.service_end_date,
									retail_date: vehicle.retail_date,
								}),
							);

						// Convert fetched vehicles data to the same format
						let fetchedVehicles = r.message.map((vehicle) => ({
							vin_serial_no: vehicle.name,
							description: vehicle.description,
							colour: vehicle.colour,
							warranty_end_date: vehicle.warranty_end_date,
							service_end_date: vehicle.service_end_date,
							retail_date: vehicle.retail_date,
						}));

						// Check if the current data and fetched data are the same
						if (
							JSON.stringify(currentVehicles) !==
							JSON.stringify(fetchedVehicles)
						) {
							// Clear and update the child table only if there are changes
							frm.clear_table("vehicles_linked_to_customer");

							fetchedVehicles.forEach((vehicle) => {
								frm.add_child("vehicles_linked_to_customer", {
									vin_serial_no: vehicle.vin_serial_no,
									description: vehicle.description,
									colour: vehicle.colour,
									warranty_end_date:
										vehicle.warranty_end_date,
									service_end_date: vehicle.service_end_date,
									retail_date: vehicle.retail_date,
								});
							});

							frm.refresh_field("vehicles_linked_to_customer");
							frm.save();
						}
					}
				},
			});
		}
	},

	before_save(frm) {
		let fullname =
			frm.doc.customer_name + " " + (frm.doc.customer_surname || "");

		frm.set_value("customer_full_name", fullname);
	},
});

function validate_id_no(frm) {
	if (frm.doc.id_no) {
		frappe.db
			.get_single_value("System Settings", "country")
			.then((country) => {
				console.log(country);

				if (country == "South Africa") {
					const id_number = frm.doc.id_no;

					// Validate if ID number is 13 digits long
					if (
						id_number &&
						id_number.length === 13 &&
						!isNaN(id_number)
					) {
						if (validate_south_african_id(id_number)) {
							frappe.validated = true;

							// Calculate and set age
							const birthdate = id_number.substr(0, 6);
							const age = calculate_age_from_id(birthdate);
							frm.set_value("age", age);
						} else {
							frappe.msgprint("Invalid South African ID Number.");
							frappe.validated = false;
						}
					} else {
						frappe.msgprint("ID number must be 13 digits.");
						frappe.validated = false;
					}
				}
			});
	}
}

// Function to calculate age from the birthdate in the ID number
function calculate_age_from_id(birthdate) {
	// Extract year, month, day from ID number
	let year = parseInt(birthdate.substr(0, 2), 10);
	const month = parseInt(birthdate.substr(2, 2), 10) - 1;
	const day = parseInt(birthdate.substr(4, 2), 10);

	// Get the current year and century
	const currentYear = new Date().getFullYear();
	const currentTwoDigitYear = currentYear % 100;

	// Determine the full year
	if (year > currentTwoDigitYear) {
		year += 1900; // Assume it's in the 1900s
	} else {
		year += 2000; // Assume it's in the 2000s
	}

	// Create a birth date object
	const birthDate = new Date(year, month, day);
	const today = new Date();

	// Calculate age
	let age = today.getFullYear() - birthDate.getFullYear();
	const monthDifference = today.getMonth() - birthDate.getMonth();

	// If the birth month hasn't occurred yet this year or it's the birth month but the day hasn't passed
	if (
		monthDifference < 0 ||
		(monthDifference === 0 && today.getDate() < birthDate.getDate())
	) {
		age--;
	}

	// Since ID numbers can only be issued from age 16, if the calculated age is less than 16, we adjust it
	if (age < 16) {
		year -= 100; // Adjust year to be in the 1900s
		birthDate.setFullYear(year); // Set birth date to the adjusted year
		age = today.getFullYear() - birthDate.getFullYear(); // Recalculate age
	}

	return age;
}

// Validate Email Address
function validate_email(frm) {
	if (frm.doc.email) {
		const email = frm.doc.email;

		// Basic email pattern for validation
		const email_pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

		if (email && !email_pattern.test(email)) {
			frappe.msgprint("Invalid email address.");
			frappe.validated = false;
		} else {
			frappe.validated = true;
		}
	}
}

function validate_south_african_id(id_number) {
	// Extract the relevant parts of the ID
	const birthdate = id_number.substr(0, 6);
	const citizenship = id_number.charAt(10);
	const check_digit = id_number.charAt(12);

	// Validate birthdate
	if (!is_valid_date(birthdate)) {
		console.log("Invalid date.");
		return false;
	}

	// Validate citizenship (0 for citizen, 1 for permanent resident)
	if (!(citizenship === "0" || citizenship === "1")) {
		console.log("Invalid citizenship digit.");
		return false;
	}

	// Validate using Luhn algorithm
	if (!validate_luhn(id_number)) {
		console.log("Luhn check failed.");
		return false;
	}

	console.log("ID number is valid.");
	return true;
}

// Function to validate birthdate (YYMMDD format)
function is_valid_date(birthdate) {
	const year = parseInt(birthdate.substr(0, 2), 10);
	const month = parseInt(birthdate.substr(2, 2), 10);
	const day = parseInt(birthdate.substr(4, 2), 10);

	if (month < 1 || month > 12) return false;
	if (day < 1 || day > 31) return false;

	// Handle leap years for February
	if (month === 2) {
		if (day > 29) return false;
		if (
			day === 29 &&
			!((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0)
		) {
			return false;
		}
	}

	return true;
}

// Luhn Algorithm for checksum validation
function validate_luhn(id_number) {
	let sum = 0;
	let alternate = false;

	for (let i = id_number.length - 1; i >= 0; i--) {
		let n = parseInt(id_number.charAt(i), 10);

		if (alternate) {
			n *= 2;
			if (n > 9) n -= 9;
		}

		sum += n;
		alternate = !alternate;
	}

	return sum % 10 === 0;
}
