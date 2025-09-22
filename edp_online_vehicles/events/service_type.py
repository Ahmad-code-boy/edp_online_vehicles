import frappe


@frappe.whitelist()
def service_type_query(doctype, txt, searchfield, start, page_len, filters):
	# Initialize filters for Service Schedules
	service_schedule_filters = {}

	# Apply filters based on passed arguments
	if filters.get("model_code"):
		service_schedule_filters["model_code"] = filters.get("model_code")

	# Get the Vehicles VIN number/serial number from Vehicles Service if provided
	vinserial_no = filters.get("vinserial_no")
	if vinserial_no:
		vehicles_service_filters = {"vinserial_no": vinserial_no}
		# Fetch the service types associated with the given Vehicles VIN number/serial number
		used_service_types_data = frappe.get_all(
			"Vehicles Service", filters=vehicles_service_filters, fields=["service_type"]
		)
		used_service_type_names = (
			[d["service_type"] for d in used_service_types_data] if used_service_types_data else []
		)
	else:
		used_service_type_names = []

	# Get all service types from Service Schedules based on filters
	all_service_types = frappe.get_all("Service Schedules", fields=["name"], filters=service_schedule_filters)
	all_service_type_names = [d["name"] for d in all_service_types] if all_service_types else []

	# Filter out the used service types from all service types
	available_service_types = []
	mm_services = []
	if filters.get("model_code"):
		mm_services = [[f"SS-{filters.get('model_code')}-Major"], [f"SS-{filters.get('model_code')}-Minor"]]
	for service_type in all_service_type_names:
		if service_type not in used_service_type_names:
			available_service_types.append([service_type])
	available_service_types.extend(mm_services)
	return available_service_types
