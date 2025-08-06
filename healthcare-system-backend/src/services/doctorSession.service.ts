// src/services/doctorSession.service.ts
import 'reflect-metadata';
import { AppDataSource } from "../config/data-source";
import { Doctor } from "../entities/Doctor";
import { AvailabilitySlot, SlotType } from "../entities/AvailabilitySlot";
import { Appointment, AppointmentStatus } from "../entities/Appointment";
import { Between, In } from "typeorm";
import { sendEmailNotification } from '../util/notifications'; // Corrected path to 'notifications'

interface AdjustDoctorSessionInput {
    doctorId: string;
    date: string;
    newStartTime: string;
    newEndTime: string;
    newConsultationDurationMinutes?: number;
    slotIdToAdjustCapacity?: string;
    newMaxCapacity?: number;
}

// Service for adjusting a doctor's session, including creating/deleting/updating availability slots
// and cancelling affected appointments.
export const adjustDoctorSessionService = async ({
    doctorId,
    date,
    newStartTime,
    newEndTime,
    newConsultationDurationMinutes,
    slotIdToAdjustCapacity,
    newMaxCapacity
}: AdjustDoctorSessionInput) => {
    console.log("AdjustDoctorSessionService received:", { doctorId, date, newStartTime, newEndTime, newConsultationDurationMinutes, slotIdToAdjustCapacity, newMaxCapacity });

    const doctorRepo = AppDataSource.getRepository(Doctor);
    const slotRepo = AppDataSource.getRepository(AvailabilitySlot);
    const appointmentRepo = AppDataSource.getRepository(Appointment);

    const doctor = await doctorRepo.findOneBy({ id: doctorId });
    if (!doctor) {
        const error: any = new Error("Doctor not found.");
        error.status = 404;
        throw error;
    }

    const newSessionStartDateTime = new Date(newStartTime);
    const newSessionEndDateTime = new Date(newEndTime);

    if (isNaN(newSessionStartDateTime.getTime()) || isNaN(newSessionEndDateTime.getTime())) {
        const error: any = new Error("Invalid newStartTime or newEndTime format.");
        error.status = 400;
        throw error;
    }
    if (newSessionEndDateTime <= newSessionStartDateTime) {
        const error: any = new Error("newEndTime must be after newStartTime.");
        error.status = 400;
        throw error;
    }

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // Fetch all active appointments for the day within the original session range
    const appointmentsForDay = await appointmentRepo.find({
        where: {
            doctorId: doctorId,
            appointmentTime: Between(startOfDay, endOfDay),
            status: In([AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED])
        },
        relations: ["slot", "patient", "patient.user", "doctor", "doctor.user"], // Include relations for email notifications
        order: { appointmentTime: "ASC" }
    });

    let affectedAppointments: Appointment[] = [];
    let slotsToDelete: AvailabilitySlot[] = [];
    let newSlotsCreatedCount = 0;
    let slotsUpdatedCount = 0;
    let capacityAdjustedSlotsCount = 0;

    const generatedSlots: AvailabilitySlot[] = [];

    await AppDataSource.manager.transaction(async transactionalEntityManager => {

        // Identify appointments that fall outside the new session time and mark them for cancellation
        for (const app of appointmentsForDay) {
            if (app.slot && (app.slot.startTime < newSessionStartDateTime || app.slot.endTime > newSessionEndDateTime)) {
                affectedAppointments.push(app);

                const appointmentToUpdate = await transactionalEntityManager.findOne(Appointment, { where: { id: app.id } });

                if (appointmentToUpdate) {
                    appointmentToUpdate.status = AppointmentStatus.CANCELLED;
                    appointmentToUpdate.slot = null as unknown as AvailabilitySlot | undefined;
                    appointmentToUpdate.slotId = null as unknown as string | undefined;
                    appointmentToUpdate.updatedAt = new Date();
                    await transactionalEntityManager.save(appointmentToUpdate);
                }

                // Send cancellation email for affected appointments
                if (app.patient?.user?.email) {
                    await sendEmailNotification({
                        type: 'cancelled',
                        appointment: app,
                        patientEmail: app.patient.user.email,
                        doctorEmail: app.doctor?.user?.email,
                        reason: 'Doctor session was adjusted, and your appointment now falls outside the new time range.'
                    });
                } else {
                    console.warn(`Could not send cancellation email for appointment ${app.id}: Patient email not found.`);
                }

                // Mark the original slot for deletion if it's no longer needed
                slotsToDelete.push(app.slot);
            }
        }

        // Identify all existing slots for the day that are outside the new session time and mark for deletion
        const allExistingSlotsForDay = await slotRepo.find({
            where: {
                doctorId: doctorId,
                startTime: Between(startOfDay, endOfDay)
            }
        });

        for (const slot of allExistingSlotsForDay) {
            const isAlreadyMarkedForDeletion = slotsToDelete.some(s => s.id === slot.id);
            if (!isAlreadyMarkedForDeletion && (slot.startTime < newSessionStartDateTime || slot.endTime > newSessionEndDateTime)) {
                slotsToDelete.push(slot);
            }
        }

        // Delete all identified slots
        for (const slot of slotsToDelete) {
            await transactionalEntityManager.delete(AvailabilitySlot, slot.id);
        }

        const effectiveConsultationDurationMinutes = newConsultationDurationMinutes || 15;

        // Get current active slots within the new session time range (excluding those marked for deletion)
        const currentActiveSlots = await slotRepo.find({
            where: {
                doctorId: doctorId,
                startTime: Between(newSessionStartDateTime, newSessionEndDateTime)
            },
            order: { startTime: "ASC" }
        });

        // Helper to check if a slot is currently booked by an active appointment
        const isSlotBooked = (slotId: string): boolean => {
            return appointmentsForDay.some(app => app.slotId === slotId && (app.status === AppointmentStatus.PENDING || app.status === AppointmentStatus.CONFIRMED));
        };

        currentActiveSlots.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

        // Process existing slots within the new session range
        for (const existingSlot of currentActiveSlots) {
            // Skip if this slot was already marked for deletion
            if (slotsToDelete.some(s => s.id === existingSlot.id)) {
                continue;
            }

            const existingDuration = (existingSlot.endTime.getTime() - existingSlot.startTime.getTime()) / (60 * 1000);
            const slotIsBookedCheck = isSlotBooked(existingSlot.id);

            // If a stream slot's duration doesn't match the new consultation duration
            if (existingDuration !== effectiveConsultationDurationMinutes &&
                existingSlot.startTime >= newSessionStartDateTime &&
                existingSlot.endTime <= newSessionEndDateTime &&
                existingSlot.slotType === SlotType.STREAM) {

                if (slotIsBookedCheck) {
                    // If booked, adjust its end time to match the new consultation duration
                    const newBookedSlotEndTime = new Date(existingSlot.startTime.getTime() + effectiveConsultationDurationMinutes * 60 * 1000);

                    if (newBookedSlotEndTime < existingSlot.endTime) {
                        existingSlot.endTime = newBookedSlotEndTime;
                        await transactionalEntityManager.save(existingSlot);
                        slotsUpdatedCount++;

                        // Create a new free slot for the remaining time
                        const freedSegmentStart = newBookedSlotEndTime;
                        const freedSegmentEnd = existingSlot.endTime;

                        if (freedSegmentEnd.getTime() > freedSegmentStart.getTime()) {
                            const newFreedSlot = slotRepo.create({
                                startTime: freedSegmentStart,
                                endTime: freedSegmentEnd,
                                doctorId: doctorId,
                                isAvailable: true,
                                slotType: SlotType.STREAM,
                                maxCapacity: null as unknown as number | undefined,
                                bookedCount: 0
                            });
                            generatedSlots.push(newFreedSlot);
                            newSlotsCreatedCount++;
                        }
                    }
                } else {
                    // If not booked, delete the old slot and recreate it with the new duration
                    await transactionalEntityManager.delete(AvailabilitySlot, existingSlot.id);
                    slotsToDelete.push(existingSlot); // Add to deleted list for tracking

                    let currentSubSlotTime = existingSlot.startTime;
                    while (currentSubSlotTime < existingSlot.endTime) {
                        const subSlotEndTime = new Date(currentSubSlotTime.getTime() + effectiveConsultationDurationMinutes * 60 * 1000);
                        const finalSubSlotEndTime = subSlotEndTime > existingSlot.endTime ? existingSlot.endTime : subSlotEndTime;

                        if (finalSubSlotEndTime.getTime() > currentSubSlotTime.getTime()) {
                            const newSubSlot = slotRepo.create({
                                startTime: currentSubSlotTime,
                                endTime: finalSubSlotEndTime,
                                doctorId: doctorId,
                                isAvailable: true,
                                slotType: SlotType.STREAM,
                                maxCapacity: null as unknown as number | undefined,
                                bookedCount: 0
                            });
                            generatedSlots.push(newSubSlot);
                            newSlotsCreatedCount++;
                        }
                        currentSubSlotTime = finalSubSlotEndTime;
                    }
                }
            }
        }

        console.log("Checking for specific slot capacity adjustment.");
        if (slotIdToAdjustCapacity && newMaxCapacity !== undefined) {
            console.log("Capacity adjustment requested for slot:", slotIdToAdjustCapacity, "newMaxCapacity:", newMaxCapacity);
            const targetSlot = await transactionalEntityManager.findOne(AvailabilitySlot, { where: { id: slotIdToAdjustCapacity, doctorId: doctorId } });

            if (targetSlot) {
                console.log("Target Slot found:", { id: targetSlot.id, slotType: targetSlot.slotType, maxCapacity: targetSlot.maxCapacity, bookedCount: targetSlot.bookedCount });

                if (targetSlot.slotType !== SlotType.WAVE) {
                    console.log("Converting stream slot to wave and adjusting capacity.");
                    targetSlot.slotType = SlotType.WAVE;
                    targetSlot.maxCapacity = newMaxCapacity;
                    targetSlot.isAvailable = targetSlot.bookedCount < newMaxCapacity; // Update availability based on new capacity
                    await transactionalEntityManager.save(targetSlot);
                    capacityAdjustedSlotsCount++;
                } else {
                    console.log("Target is already a wave slot. Checking capacity reduction.");
                    console.log("Current bookedCount (before check):", targetSlot.bookedCount, "New maxCapacity:", newMaxCapacity);
                    if (newMaxCapacity < targetSlot.bookedCount) {
                        const excessBookings = targetSlot.bookedCount - newMaxCapacity;
                        console.log("Excess bookings calculated:", excessBookings);

                        if (excessBookings > 0) {
                            console.log("Querying appointments to cancel...");
                            // Fetch appointments to cancel, ordered by creation date (oldest first for fairness, or newest first as per original code)
                            // The original code used `createdAt: "DESC"`, which cancels newest first. Let's stick to that for consistency with the conflict resolution.
                            const appointmentsToCancel = await appointmentRepo.find({
                                where: { slotId: targetSlot.id, status: In([AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED]) },
                                order: { createdAt: "DESC" }, // Cancels newest appointments first
                                take: excessBookings
                            });
                            console.log("Appointments found to potentially cancel (IDs):", appointmentsToCancel.map(a => a.id));
                            console.log("Number of appointments found to potentially cancel:", appointmentsToCancel.length);

                            for (const appToCancel of appointmentsToCancel) {
                                // Fetch the appointment again within the transaction to ensure it's the latest version
                                const appToCancelEntity = await transactionalEntityManager.findOne(Appointment, {
                                    where: { id: appToCancel.id },
                                    relations: ["patient", "patient.user", "doctor", "doctor.user"] // Ensure relations for email
                                });

                                if (appToCancelEntity) {
                                    appToCancelEntity.status = AppointmentStatus.CANCELLED;
                                    appToCancelEntity.slot = null as unknown as AvailabilitySlot | undefined;
                                    appToCancelEntity.slotId = null as unknown as string | undefined;
                                    appToCancelEntity.updatedAt = new Date();
                                    await transactionalEntityManager.save(appToCancelEntity);
                                    console.log(`❕ Notification: Appointment ${appToCancel.id} cancelled due to wave slot capacity reduction.`);

                                    // Send cancellation email for these appointments
                                    if (appToCancelEntity.patient?.user?.email) {
                                        await sendEmailNotification({
                                            type: 'cancelled',
                                            appointment: appToCancelEntity,
                                            patientEmail: appToCancelEntity.patient.user.email,
                                            doctorEmail: appToCancelEntity.doctor?.user?.email,
                                            reason: `Doctor session capacity was reduced, and your appointment was affected.`
                                        });
                                    } else {
                                        console.warn(`Could not send cancellation email for appointment ${appToCancel.id}: Patient email not found.`);
                                    }

                                    affectedAppointments.push(appToCancelEntity); // Add to affected list
                                    targetSlot.bookedCount--; // Decrement booked count for the slot
                                }
                            }
                            console.log("Finished cancelling excess appointments. New bookedCount for targetSlot:", targetSlot.bookedCount);
                        }
                    }
                    targetSlot.maxCapacity = newMaxCapacity;
                    targetSlot.isAvailable = targetSlot.bookedCount < newMaxCapacity; // Update availability based on new capacity
                    await transactionalEntityManager.save(targetSlot);
                    capacityAdjustedSlotsCount++;
                    console.log("Updated wave slot capacity.");
                }
            } else {
                console.log("Target slot for capacity adjustment not found.");
            }
        }

        // Determine occupied time ranges from existing slots (after potential updates/deletions) and newly generated slots
        const occupiedTimeRanges: { start: Date, end: Date }[] = [];

        currentActiveSlots.forEach(slot => {
            const slotIsBookedCheck = isSlotBooked(slot.id);
            // Include slots that are not deleted, or are booked stream slots whose duration matches the new consultation duration
            // This condition ensures that existing booked stream slots are considered occupied for their *original* duration if they were not split.
            // If they were split, the `existingSlot.endTime` would have been adjusted, and the `freedSegment` would be a new slot.
            // For wave slots, they are considered occupied based on their original time range.
            if (!slotsToDelete.some(s => s.id === slot.id) || (slotIsBookedCheck && slot.slotType === SlotType.STREAM && (slot.endTime.getTime() === slot.startTime.getTime() + effectiveConsultationDurationMinutes * 60 * 1000))) {
                const finalEndTime = slotIsBookedCheck && slot.slotType === SlotType.STREAM
                                         ? new Date(slot.startTime.getTime() + effectiveConsultationDurationMinutes * 60 * 1000)
                                         : slot.endTime;
                occupiedTimeRanges.push({ start: slot.startTime, end: finalEndTime });
            } else if (!slotsToDelete.some(s => s.id === slot.id) && slot.slotType === SlotType.WAVE) {
                 // For wave slots, if not deleted, they occupy their full range
                occupiedTimeRanges.push({ start: slot.startTime, end: slot.endTime });
            }
        });
        generatedSlots.forEach(slot => {
            occupiedTimeRanges.push({ start: slot.startTime, end: slot.endTime });
        });

        // Merge overlapping occupied time ranges
        occupiedTimeRanges.sort((a, b) => a.start.getTime() - b.start.getTime());
        const mergedOccupiedRanges: { start: Date, end: Date }[] = [];
        if (occupiedTimeRanges.length > 0) {
            mergedOccupiedRanges.push(occupiedTimeRanges[0]);
            for (let i = 1; i < occupiedTimeRanges.length; i++) {
                const lastMerged = mergedOccupiedRanges[mergedOccupiedRanges.length - 1];
                const current = occupiedTimeRanges[i];
                if (current.start <= lastMerged.end) {
                    lastMerged.end = new Date(Math.max(lastMerged.end.getTime(), current.end.getTime()));
                } else {
                    mergedOccupiedRanges.push(current);
                }
            }
        }

        // Generate new stream slots for the remaining free time within the new session range
        let currentFillTime = newSessionStartDateTime;
        while (currentFillTime < newSessionEndDateTime) {
            let nextOccupiedStart: Date | null = null;
            let nextOccupiedEnd: Date | null = null;

            for (const mergedRange of mergedOccupiedRanges) {
                if (mergedRange.start >= currentFillTime) {
                    nextOccupiedStart = mergedRange.start;
                    nextOccupiedEnd = mergedRange.end;
                    break;
                }
            }

            const gapEndTime = nextOccupiedStart || newSessionEndDateTime;

            if (gapEndTime.getTime() > currentFillTime.getTime()) {
                let tempCurrentTime = currentFillTime;
                while (tempCurrentTime < gapEndTime) {
                    const potentialNewSlotEndTime = new Date(tempCurrentTime.getTime() + effectiveConsultationDurationMinutes * 60 * 1000);
                    const newSlotEndTime = potentialNewSlotEndTime > gapEndTime ? gapEndTime : potentialNewSlotEndTime;

                    if (newSlotEndTime.getTime() > tempCurrentTime.getTime()) {
                        const newSlot = slotRepo.create({
                            startTime: tempCurrentTime,
                            endTime: newSlotEndTime,
                            doctorId: doctorId,
                            isAvailable: true,
                            slotType: SlotType.STREAM, // New slots are always STREAM by default
                            maxCapacity: null as unknown as number | undefined,
                            bookedCount: 0
                        });
                        generatedSlots.push(newSlot);
                        newSlotsCreatedCount++;
                    }
                    tempCurrentTime = newSlotEndTime;
                }
            }
            
            if (nextOccupiedStart && nextOccupiedEnd) {
                currentFillTime = new Date(Math.max(nextOccupiedEnd.getTime(), currentFillTime.getTime()));
            } else {
                currentFillTime = newSessionEndDateTime;
            }
        }

        // Save all newly generated slots
        if (generatedSlots.length > 0) {
            await transactionalEntityManager.save(generatedSlots);
        }

    });

    return {
        message: "Doctor session adjustment processed. Affected appointments cancelled, slots adjusted, and new slots generated.",
        adjustedDate: date,
        newSessionStart: newSessionStartDateTime.toISOString(),
        newSessionEnd: newSessionEndDateTime.toISOString(),
        appointmentsCancelled: affectedAppointments.length,
        freedSlotsCount: slotsToDelete.length, // This now represents slots that were entirely deleted
        newSlotsCreatedCount: newSlotsCreatedCount,
        slotsUpdatedCount: slotsUpdatedCount, // This refers to stream slots whose end time was adjusted
        capacityAdjustedSlotsCount: capacityAdjustedSlotsCount // This refers to wave slots whose capacity was changed
    };
};