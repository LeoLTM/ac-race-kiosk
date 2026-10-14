import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";
import { StatusCodes } from "http-status-codes";
import request from "supertest";
import { serveFrontend } from "@/common/middleware/serveFrontend";

describe("serveFrontend", () => {
	let distDir: string;
	let app: express.Express;

	beforeAll(() => {
		distDir = mkdtempSync(path.join(tmpdir(), "racekiosk-dist-"));
		mkdirSync(path.join(distDir, "assets"));
		writeFileSync(path.join(distDir, "index.html"), "<div id=app></div>");
		writeFileSync(path.join(distDir, "assets", "main.js"), "console.log('kiosk')");

		app = express();
		app.get("/api/admin/overview", (_req, res) => res.json({ api: true }));
		app.use(serveFrontend(distDir));
	});

	afterAll(() => {
		rmSync(distDir, { recursive: true, force: true });
	});

	it("serves the built assets", async () => {
		const response = await request(app).get("/assets/main.js");

		expect(response.status).toBe(StatusCodes.OK);
		expect(response.text).toContain("kiosk");
	});

	it("answers page routes like /admin with index.html", async () => {
		for (const page of ["/", "/admin", "/dashboard"]) {
			const response = await request(app).get(page).set("Accept", "text/html");

			expect(response.status).toBe(StatusCodes.OK);
			expect(response.text).toContain("<div id=app>");
		}
	});

	it("leaves /api to the API", async () => {
		expect((await request(app).get("/api/admin/overview")).body).toEqual({ api: true });
		expect((await request(app).get("/api/unknown").set("Accept", "text/html")).status).toBe(StatusCodes.NOT_FOUND);
	});

	it("does nothing without a frontend build", async () => {
		const bare = express().use(serveFrontend(path.join(distDir, "missing")));

		expect((await request(bare).get("/admin").set("Accept", "text/html")).status).toBe(StatusCodes.NOT_FOUND);
	});
});
