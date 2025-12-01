import { StatusCodes } from "http-status-codes";
import { ServiceResponse } from "@/common/models/serviceResponse";
import { lapTimeRepository } from "./lapTimeRepository";
import type { SubmitLapTimeRequest, SubmitLapTimeResponse, GetAllLapTimesResponse } from "./lapTimeModel";
import type { LapTime } from "@/generated/prisma";

export class LapTimeService {
	async getAllLapTimes(): Promise<ServiceResponse<GetAllLapTimesResponse | null>> {
		try {
			const lapTimes = await lapTimeRepository.findAll();
			return ServiceResponse.success("Lap times retrieved", lapTimes.map((lt) => this.toLapTimeResponse(lt)));
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
			return ServiceResponse.failure(`Failed to retrieve lap times: ${errorMessage}`, null, StatusCodes.INTERNAL_SERVER_ERROR);
		}
	}

	async submitLapTime(data: SubmitLapTimeRequest): Promise<ServiceResponse<SubmitLapTimeResponse | null>> {
		try {
			const existingLapTime = await lapTimeRepository.findByNickName(data.nickName);

			if (!existingLapTime) {
				// No existing record - create new one
				const newLapTime = await lapTimeRepository.createLapTime({
					nickName: data.nickName,
					bestLapTimeMs: data.bestLapTimeMs,
					formattedTime: data.formattedTime,
				});

				return ServiceResponse.success("Lap time recorded", {
					lapTime: this.toLapTimeResponse(newLapTime),
					wasUpdated: true,
				});
			}

			// Check if new time is better (lower is better)
			if (data.bestLapTimeMs < existingLapTime.bestLapTimeMs) {
				const updatedLapTime = await lapTimeRepository.updateLapTime(data.nickName, {
					bestLapTimeMs: data.bestLapTimeMs,
					formattedTime: data.formattedTime,
				});

				return ServiceResponse.success("New best lap time", {
					lapTime: this.toLapTimeResponse(updatedLapTime),
					wasUpdated: true,
				});
			}

			// Existing time is better - return OK but don't update
			return ServiceResponse.success("Existing time is better", {
				lapTime: this.toLapTimeResponse(existingLapTime),
				wasUpdated: false,
			});
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
			return ServiceResponse.failure(`Failed to submit lap time: ${errorMessage}`, null, StatusCodes.INTERNAL_SERVER_ERROR);
		}
	}

	private toLapTimeResponse(lapTime: LapTime) {
		return {
			id: lapTime.id,
			nickName: lapTime.nickName,
			bestLapTimeMs: lapTime.bestLapTimeMs,
			formattedTime: lapTime.formattedTime,
			createdAt: lapTime.createdAt,
			updatedAt: lapTime.updatedAt,
		};
	}
}

export const lapTimeService = new LapTimeService();
