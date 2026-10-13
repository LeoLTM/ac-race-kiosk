-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "LapTime";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Placeholder";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "Driver" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Rig" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" DATETIME,
    "appVersion" TEXT,
    "track" TEXT,
    "trackConfig" TEXT,
    "car" TEXT
);

-- CreateTable
CREATE TABLE "QueueEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "driverId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'WAITING',
    "sortKey" REAL NOT NULL,
    "skipCount" INTEGER NOT NULL DEFAULT 0,
    "rigId" INTEGER,
    "calledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QueueEntry_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QueueEntry_rigId_fkey" FOREIGN KEY ("rigId") REFERENCES "Rig" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rigId" INTEGER NOT NULL,
    "driverId" TEXT NOT NULL,
    "queueEntryId" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" DATETIME NOT NULL,
    "endedAt" DATETIME,
    "endReason" TEXT,
    "track" TEXT,
    "trackConfig" TEXT,
    "car" TEXT,
    CONSTRAINT "Session_rigId_fkey" FOREIGN KEY ("rigId") REFERENCES "Rig" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Session_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Session_queueEntryId_fkey" FOREIGN KEY ("queueEntryId") REFERENCES "QueueEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Lap" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientLapId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "rigId" INTEGER NOT NULL,
    "lapTimeMs" INTEGER NOT NULL,
    "valid" BOOLEAN NOT NULL,
    "invalidReason" TEXT,
    "sectorsMs" TEXT,
    "track" TEXT NOT NULL,
    "trackConfig" TEXT NOT NULL DEFAULT '',
    "car" TEXT NOT NULL,
    "completedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Lap_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Lap_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Lap_rigId_fkey" FOREIGN KEY ("rigId") REFERENCES "Rig" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Driver_nameKey_key" ON "Driver"("nameKey");

-- CreateIndex
CREATE INDEX "QueueEntry_status_sortKey_idx" ON "QueueEntry"("status", "sortKey");

-- CreateIndex
CREATE UNIQUE INDEX "Session_queueEntryId_key" ON "Session"("queueEntryId");

-- CreateIndex
CREATE INDEX "Session_rigId_endedAt_idx" ON "Session"("rigId", "endedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Lap_clientLapId_key" ON "Lap"("clientLapId");

-- CreateIndex
CREATE INDEX "Lap_track_trackConfig_car_valid_lapTimeMs_idx" ON "Lap"("track", "trackConfig", "car", "valid", "lapTimeMs");

-- CreateIndex
CREATE INDEX "Lap_sessionId_idx" ON "Lap"("sessionId");
