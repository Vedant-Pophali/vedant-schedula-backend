export interface AppointmentNotificationData {
    type: 'booked' | 'cancelled' | 'rescheduled' | 'capacity_adjusted';
    appointment: any; 
    patientEmail: string; 
    doctorEmail?: string; 
    reason?: string; 
    oldSlotDetails?: { startTime: Date, endTime: Date }; 
    newSlotDetails?: { startTime: Date, endTime: Date }; 
}

export const sendEmailNotification = async (data: AppointmentNotificationData): Promise<void> => {
    const { type, appointment, patientEmail, doctorEmail, reason, oldSlotDetails, newSlotDetails } = data;

    let subject = "";
    let body = "";
    const doctorFullName = appointment.doctor?.fullName || 'N/A';

    switch (type) {
        case 'booked':
            subject = `Appointment Confirmation: #${appointment.id}`;
            body = `Dear Patient,\n\nYour appointment with Dr. ${doctorFullName} has been successfully booked for ${appointment.appointmentTime.toLocaleString()}.\n\nNotes: ${appointment.notes || 'N/A'}\n\nThank you.`;
            break;
        case 'cancelled':
            subject = `Appointment Cancellation: #${appointment.id}`;
            body = `Dear Patient,\n\nYour appointment with Dr. ${doctorFullName} on ${appointment.appointmentTime.toLocaleString()} has been cancelled.`;
            if (reason) {
                body += `\nReason: ${reason}`;
            }
            body += `\n\nWe apologize for any inconvenience.`;
            break;
        case 'rescheduled':
            subject = `Appointment Rescheduled: #${appointment.id}`;
            body = `Dear Patient,\n\nYour appointment with Dr. ${doctorFullName} has been rescheduled.`;
            if (oldSlotDetails && newSlotDetails) {
                body += `\nOld time: ${oldSlotDetails.startTime.toLocaleString()} - ${oldSlotDetails.endTime.toLocaleString()}`;
                body += `\nNew time: ${newSlotDetails.startTime.toLocaleString()} - ${newSlotDetails.endTime.toLocaleString()}`;
            } else {
                body += `\nNew time: ${appointment.appointmentTime.toLocaleString()}`;
            }
            body += `\n\nThank you.`;
            break;
        case 'capacity_adjusted':
            subject = `Doctor Session Adjusted: ${appointment.doctorId}`;
            body = `Dear Doctor,\n\nYour session on ${appointment.appointmentTime.toLocaleDateString()} had a capacity adjustment.`;
            if (reason) {
                body += `\nDetails: ${reason}`;
            }
            body += `\n\nPlease review your schedule.`;
            break;
        default:
            subject = "Notification";
            body = "An event has occurred.";
    }

    console.log(`--- EMAIL NOTIFICATION ---`);
    console.log(`To: ${patientEmail}`);
    if (doctorEmail && doctorEmail !== 'N/A') {
        console.log(`Cc (Doctor): ${doctorEmail}`);
    }
    console.log(`Subject: ${subject}`);
    console.log(`Body:\n${body}`);
    console.log(`--- END EMAIL NOTIFICATION ---\n`);
};

export const sendSmsNotification = async (to: string, message: string): Promise<void> => {
    console.log(`--- SMS NOTIFICATION ---`);
    console.log(`To: ${to}`);
    console.log(`Message: ${message}`);
    console.log(`--- END SMS NOTIFICATION ---\n`);
};
