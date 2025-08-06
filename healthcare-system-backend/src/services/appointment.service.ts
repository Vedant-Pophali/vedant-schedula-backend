// src/services/appointment.service.ts
import 'reflect-metadata';
import { AppDataSource } from "../config/data-source";
import { Appointment, AppointmentStatus } from "../entities/Appointment";
import { AvailabilitySlot, SlotType } from "../entities/AvailabilitySlot";
import { Doctor } from "../entities/Doctor";
import { Patient } from "../entities/Patients";
import { sendEmailNotification } from '../util/notifications'; // Ensure this utility is available

interface BookAppointmentInput {
    slotId: string;
    patientId: string;
    notes?: string;
    // For wave scheduling, optionally allow patient to suggest a specific time within the wave
    // or let the system assign based on sequence.
    expectedCheckInTime?: string; // Optional for wave slots
}

// Service for booking an appointment
export const bookAppointmentService = async ({ slotId, patientId, notes, expectedCheckInTime }: BookAppointmentInput) => {
    const appointmentRepo = AppDataSource.getRepository(Appointment);
    const slotRepo = AppDataSource.getRepository(AvailabilitySlot);
    const patientRepo = AppDataSource.getRepository(Patient);

    const slot = await slotRepo.findOne({
        where: { id: slotId },
        relations: ["doctor", "doctor.user"], // Include doctor.user for email notifications
    });

    if (!slot) {
        const error: any = new Error("Availability slot not found. It may have been adjusted or removed by the doctor.");
        error.status = 404;
        throw error;
    }

    // Additional check: Ensure the slot is not in the past relative to current time
    if (slot.startTime < new Date()) {
        const error: any = new Error("Cannot book a slot that has already started or passed.");
        error.status = 400;
        throw error;
    }

    // Logic for WAVE scheduling
    if (slot.slotType === SlotType.WAVE) {
        if (slot.maxCapacity === null || slot.maxCapacity === undefined) {
            const error: any = new Error("Wave slot has no defined max capacity.");
            error.status = 400;
            throw error;
        }
        if (slot.bookedCount >= slot.maxCapacity) {
            const error: any = new Error("Wave slot is fully booked.");
            error.status = 409; // Conflict
            throw error;
        }
    } else { // SlotType.STREAM
        if (!slot.isAvailable) {
            const error: any = new Error("Stream slot is already booked or not available.");
            error.status = 409; // Conflict
            throw error;
        }
    }

    const patientWithUser = await patientRepo.findOne({ where: { id: patientId }, relations: ["user"] });
    if (!patientWithUser || !patientWithUser.user) {
        const error: any = new Error("Patient user profile not found.");
        error.status = 404;
        throw error;
    }

    const newAppointment = appointmentRepo.create({
        doctor: slot.doctor,
        doctorId: slot.doctorId,
        patient: patientWithUser,
        patientId: patientWithUser.id,
        slot: slot,
        slotId: slot.id,
        appointmentTime: slot.startTime, // Default to slot start time for now
        status: AppointmentStatus.PENDING,
        notes: notes,
        expectedCheckInTime: expectedCheckInTime ? new Date(expectedCheckInTime) : undefined, // Set if provided
    });

    await AppDataSource.manager.transaction(async transactionalEntityManager => {
        await transactionalEntityManager.save(newAppointment);

        // Update slot availability/booked count based on slot type
        if (slot.slotType === SlotType.WAVE) {
            // Increment bookedCount for wave slots
            await transactionalEntityManager.update(AvailabilitySlot, slot.id, { bookedCount: slot.bookedCount + 1 });
        } else { // SlotType.STREAM
            // Mark stream slot as unavailable
            await transactionalEntityManager.update(AvailabilitySlot, slot.id, { isAvailable: false });
        }

        // Send email notification for booking
        if (patientWithUser.user.email) {
            await sendEmailNotification({
                type: 'booked',
                appointment: newAppointment,
                patientEmail: patientWithUser.user.email,
                doctorEmail: slot.doctor?.user?.email, // Doctor email might be null if relation fails
                reason: 'Your appointment has been successfully booked.'
            });
        } else {
            console.warn(`Could not send booking confirmation email for appointment ${newAppointment.id}: Patient email not found.`);
        }
    });

    return {
        message: `Appointment booked successfully. Status: ${newAppointment.status}`,
        appointmentId: newAppointment.id,
        status: newAppointment.status,
    };
};

export const rescheduleAppointmentService = async (
    appointmentId: string,
    newSlotId: string,
    patientId: string
) => {
    const appointmentRepo = AppDataSource.getRepository(Appointment);
    const slotRepo = AppDataSource.getRepository(AvailabilitySlot);

    const appointment = await appointmentRepo.findOne({
        where: { id: appointmentId, patientId: patientId },
        relations: ["slot", "patient", "patient.user", "doctor", "doctor.user"], // Include relations for email notifications
    });

    if (!appointment) {
        const error: any = new Error("Appointment not found or you don't have permission.");
        error.status = 404;
        throw error;
    }

    if (appointment.status !== AppointmentStatus.PENDING && appointment.status !== AppointmentStatus.CONFIRMED) {
        const error: any = new Error("Only pending or confirmed appointments can be rescheduled.");
        error.status = 400;
        throw error;
    }

    const newSlot = await slotRepo.findOneBy({ id: newSlotId });
    if (!newSlot) {
        const error: any = new Error("New availability slot not found. It may have been adjusted or removed by the doctor.");
        error.status = 404;
        throw error;
    }

    // Additional check: Ensure the new slot is not in the past
    if (newSlot.startTime < new Date()) {
        const error: any = new Error("Cannot reschedule to a slot that has already started or passed.");
        error.status = 400;
        throw error;
    }

    // Logic for WAVE scheduling (new slot)
    if (newSlot.slotType === SlotType.WAVE) {
        if (newSlot.maxCapacity === null || newSlot.maxCapacity === undefined) {
            const error: any = new Error("New wave slot has no defined max capacity.");
            error.status = 400;
            throw error;
        }
        if (newSlot.bookedCount >= newSlot.maxCapacity) {
            const error: any = new Error("New wave slot is fully booked.");
            error.status = 409;
            throw error;
        }
    } else { // SlotType.STREAM
        if (!newSlot.isAvailable) {
            const error: any = new Error("New stream slot is not available for rescheduling.");
            error.status = 409;
            throw error;
        }
    }

    await AppDataSource.manager.transaction(async transactionalEntityManager => {
        // Decrement bookedCount for old wave slot, or mark old stream slot available
        if (appointment.slot && appointment.slotId) {
            const oldSlot = await transactionalEntityManager.findOne(AvailabilitySlot, { where: { id: appointment.slotId } });
            if (oldSlot) {
                if (oldSlot.slotType === SlotType.WAVE) {
                    await transactionalEntityManager.update(AvailabilitySlot, oldSlot.id, { bookedCount: oldSlot.bookedCount - 1 });
                } else { // SlotType.STREAM
                    await transactionalEntityManager.update(AvailabilitySlot, oldSlot.id, { isAvailable: true });
                }
            } else {
                console.warn(`Old slot ${appointment.slotId} for appointment ${appointment.id} not found during reschedule, likely deleted by doctor's session adjustment.`);
            }
        }

        await transactionalEntityManager.update(Appointment, appointment.id, {
            slot: newSlot,
            slotId: newSlot.id,
            appointmentTime: newSlot.startTime, // Default to new slot start time
            status: AppointmentStatus.RESCHEDULED,
            updatedAt: new Date(),
            // If rescheduling to a wave slot, you might want to set expectedCheckInTime here
            expectedCheckInTime: newSlot.slotType === SlotType.WAVE ? new Date() : undefined // Placeholder: set to now for wave
        });

        // Increment bookedCount for new wave slot, or mark new stream slot unavailable
        if (newSlot.slotType === SlotType.WAVE) {
            await transactionalEntityManager.update(AvailabilitySlot, newSlot.id, { bookedCount: newSlot.bookedCount + 1 });
        } else { // SlotType.STREAM
            await transactionalEntityManager.update(AvailabilitySlot, newSlot.id, { isAvailable: false });
        }

        // Send email notification for rescheduling
        if (appointment.patient?.user?.email) {
            await sendEmailNotification({
                type: 'rescheduled',
                appointment: appointment,
                patientEmail: appointment.patient.user.email,
                doctorEmail: newSlot.doctor?.user?.email, // Doctor email might be null if relation fails
                oldSlotDetails: appointment.slot ? { startTime: appointment.slot.startTime, endTime: appointment.slot.endTime } : undefined,
                newSlotDetails: { startTime: newSlot.startTime, endTime: newSlot.endTime }
            });
        } else {
            console.warn(`Could not send reschedule email for appointment ${appointment.id}: Patient email not found.`);
        }
    });

    return { message: "Appointment rescheduled successfully.", appointmentId: appointment.id };
};

export const cancelAppointmentService = async (appointmentId: string, userId: string, userRole: string) => {
    const appointmentRepo = AppDataSource.getRepository(Appointment);
    const slotRepo = AppDataSource.getRepository(AvailabilitySlot);
    const patientRepo = AppDataSource.getRepository(Patient);
    const doctorRepo = AppDataSource.getRepository(Doctor);

    const appointment = await appointmentRepo.findOne({
        where: { id: appointmentId },
        relations: ["slot", "patient", "patient.user", "doctor", "doctor.user"], // Include relations for email notifications
    });

    if (!appointment) {
        const error: any = new Error("Appointment not found.");
        error.status = 404;
        throw error;
    }

    let isAuthorized = false;
    if (userRole === "patient") {
        const patientProfile = await patientRepo.findOneBy({ user: { id: userId } });
        if (patientProfile && appointment.patientId === patientProfile.id) {
            isAuthorized = true;
        }
    } else if (userRole === "doctor") {
        const doctorProfile = await doctorRepo.findOneBy({ user: { id: userId } });
        if (doctorProfile && appointment.doctorId === doctorProfile.id) {
            isAuthorized = true;
        }
    }

    if (!isAuthorized) {
        const error: any = new Error("Forbidden: You do not have permission to cancel this appointment.");
        error.status = 403;
        throw error;
    }

    if (appointment.status === AppointmentStatus.CANCELLED || appointment.status === AppointmentStatus.COMPLETED) {
        const error: any = new Error(`Appointment is already ${appointment.status}. Cannot cancel.`);
        error.status = 400;
        throw error;
    }

    await AppDataSource.manager.transaction(async transactionalEntityManager => {
        // Decrement bookedCount for old wave slot, or mark old stream slot available
        if (appointment.slot && appointment.slotId) {
            const oldSlot = await transactionalEntityManager.findOne(AvailabilitySlot, { where: { id: appointment.slotId } });
            if (oldSlot) {
                if (oldSlot.slotType === SlotType.WAVE) {
                    await transactionalEntityManager.update(AvailabilitySlot, oldSlot.id, { bookedCount: oldSlot.bookedCount - 1 });
                } else { // SlotType.STREAM
                    await transactionalEntityManager.update(AvailabilitySlot, oldSlot.id, { isAvailable: true });
                }
            } else {
                console.warn(`Slot ${appointment.slotId} for appointment ${appointment.id} not found during cancellation, likely deleted by doctor's session adjustment.`);
            }
        }

        await transactionalEntityManager.update(Appointment, appointment.id, {
            status: AppointmentStatus.CANCELLED,
            updatedAt: new Date(),
        });

        // Send email notification for cancellation
        if (appointment.patient?.user?.email) {
            await sendEmailNotification({
                type: 'cancelled',
                appointment: appointment,
                patientEmail: appointment.patient.user.email,
                doctorEmail: appointment.doctor?.user?.email, // Doctor email might be null if relation fails
                reason: 'Your appointment has been cancelled by you or the doctor.'
            });
        } else {
            console.warn(`Could not send cancellation email for appointment ${appointment.id}: Patient email not found.`);
        }
    });

    return { message: "Appointment cancelled successfully.", appointmentId: appointment.id };
};

// Service for fetching patient's appointments
export const getPatientAppointmentsService = async (patientId: string, userId: string) => {
    const appointmentRepo = AppDataSource.getRepository(Appointment);
    const patientRepo = AppDataSource.getRepository(Patient);

    const patient = await patientRepo.findOneBy({ id: patientId, user: { id: userId } });
    if (!patient) {
        const error: any = new Error("Patient profile not found or you don't have permission.");
        error.status = 403;
        throw error;
    }

    const appointments = await appointmentRepo.find({
        where: { patientId: patient.id },
        relations: ["doctor", "slot"],
        order: { appointmentTime: "ASC" },
    });

    return appointments.map(app => ({
        id: app.id,
        doctorId: app.doctorId,
        doctorName: app.doctor ? app.doctor.fullName : 'N/A',
        patientId: app.patientId,
        appointmentTime: app.appointmentTime,
        status: app.status,
        slotId: app.slotId,
        slotDetails: app.slot ? {
            startTime: app.slot.startTime,
            endTime: app.slot.endTime,
            isAvailable: app.slot.isAvailable,
            slotType: app.slot.slotType,
            maxCapacity: app.slot.maxCapacity,
            bookedCount: app.slot.bookedCount
        } : null,
        notes: app.notes,
        expectedCheckInTime: app.expectedCheckInTime,
        createdAt: app.createdAt,
    }));
};

// Service for fetching doctor's appointments
export const getDoctorAppointmentsService = async (doctorId: string, userId: string) => {
    const appointmentRepo = AppDataSource.getRepository(Appointment);
    const doctorRepo = AppDataSource.getRepository(Doctor);

    const doctor = await doctorRepo.findOneBy({ id: doctorId, user: { id: userId } });
    if (!doctor) {
        const error: any = new Error("Doctor profile not found or you don't have permission.");
        error.status = 403;
        throw error;
    }

    const appointments = await appointmentRepo.find({
        where: { doctorId: doctor.id },
        relations: ["patient", "slot"],
        order: { appointmentTime: "ASC" },
    });

    return appointments.map(app => ({
        id: app.id,
        doctorId: app.doctorId,
        patientId: app.patientId,
        patientName: app.patient ? app.patient.fullName : 'N/A',
        appointmentTime: app.appointmentTime,
        status: app.status,
        slotId: app.slotId,
        slotDetails: app.slot ? {
            startTime: app.slot.startTime,
            endTime: app.slot.endTime,
            isAvailable: app.slot.isAvailable,
            slotType: app.slot.slotType,
            maxCapacity: app.slot.maxCapacity,
            bookedCount: app.slot.bookedCount
        } : null,
        notes: app.notes,
        expectedCheckInTime: app.expectedCheckInTime,
        createdAt: app.createdAt,
    }));
};