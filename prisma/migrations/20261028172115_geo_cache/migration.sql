-- CreateTable
CREATE TABLE "GeoCache" (
    "key" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeoCache_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "GeoCache_expiresAt_idx" ON "GeoCache"("expiresAt");
