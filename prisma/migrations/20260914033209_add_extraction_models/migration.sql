-- CreateTable
CREATE TABLE "ExtractionCategory" (
    "id" TEXT NOT NULL,
    "bolnaId" TEXT,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT 'gpt-4.1-mini',
    "industry" "Industry" NOT NULL DEFAULT 'GENERIC',
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "platformAgentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExtractionCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractionDisposition" (
    "id" TEXT NOT NULL,
    "bolnaId" TEXT,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "systemPrompt" TEXT,
    "model" TEXT NOT NULL DEFAULT 'gpt-4.1-mini',
    "isSubjective" BOOLEAN NOT NULL DEFAULT false,
    "isObjective" BOOLEAN NOT NULL DEFAULT false,
    "subjectiveType" TEXT NOT NULL DEFAULT 'text',
    "subjectiveTypeConfig" JSONB,
    "objectiveOptions" JSONB,
    "industry" "Industry" NOT NULL DEFAULT 'GENERIC',
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExtractionDisposition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExtractionCategory_bolnaId_key" ON "ExtractionCategory"("bolnaId");

-- CreateIndex
CREATE UNIQUE INDEX "ExtractionCategory_slug_key" ON "ExtractionCategory"("slug");

-- CreateIndex
CREATE INDEX "ExtractionCategory_industry_idx" ON "ExtractionCategory"("industry");

-- CreateIndex
CREATE INDEX "ExtractionCategory_platformAgentId_idx" ON "ExtractionCategory"("platformAgentId");

-- CreateIndex
CREATE UNIQUE INDEX "ExtractionDisposition_bolnaId_key" ON "ExtractionDisposition"("bolnaId");

-- CreateIndex
CREATE UNIQUE INDEX "ExtractionDisposition_slug_key" ON "ExtractionDisposition"("slug");

-- CreateIndex
CREATE INDEX "ExtractionDisposition_industry_idx" ON "ExtractionDisposition"("industry");

-- CreateIndex
CREATE INDEX "ExtractionDisposition_categoryId_idx" ON "ExtractionDisposition"("categoryId");

-- AddForeignKey
ALTER TABLE "ExtractionCategory" ADD CONSTRAINT "ExtractionCategory_platformAgentId_fkey" FOREIGN KEY ("platformAgentId") REFERENCES "PlatformAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractionDisposition" ADD CONSTRAINT "ExtractionDisposition_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExtractionCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
