-- Website Content (blogs + case studies) — additive only. One ContentPost
-- row per post, owned by a FormWebsite (e.g. SPYRO): `data` is the working
-- copy staff edit, `publishedData` the snapshot the public content API
-- serves, `version` the optimistic lock. Slugs are unique per website across
-- both types. ContentPostProduct records the website product mappings a
-- case study lists as used. No existing table or column is altered.
-- CreateEnum
CREATE TYPE "ContentPostType" AS ENUM ('BLOG', 'CASE_STUDY');

-- CreateEnum
CREATE TYPE "ContentPostStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "ContentPost" (
    "id" TEXT NOT NULL,
    "formWebsiteId" TEXT NOT NULL,
    "type" "ContentPostType" NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "ContentPostStatus" NOT NULL DEFAULT 'DRAFT',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "publishedData" JSONB,
    "hasUnpublishedChanges" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "authorId" TEXT NOT NULL,
    "updatedById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "lastPublishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentPostProduct" (
    "id" TEXT NOT NULL,
    "contentPostId" TEXT NOT NULL,
    "formWebsiteProductId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentPostProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentPost_formWebsiteId_type_status_publishedAt_idx" ON "ContentPost"("formWebsiteId", "type", "status", "publishedAt");

-- CreateIndex
CREATE INDEX "ContentPost_formWebsiteId_type_updatedAt_idx" ON "ContentPost"("formWebsiteId", "type", "updatedAt");

-- CreateIndex
CREATE INDEX "ContentPost_authorId_idx" ON "ContentPost"("authorId");

-- CreateIndex
CREATE INDEX "ContentPost_updatedById_idx" ON "ContentPost"("updatedById");

-- CreateIndex
CREATE UNIQUE INDEX "ContentPost_formWebsiteId_slug_key" ON "ContentPost"("formWebsiteId", "slug");

-- CreateIndex
CREATE INDEX "ContentPostProduct_formWebsiteProductId_idx" ON "ContentPostProduct"("formWebsiteProductId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentPostProduct_contentPostId_formWebsiteProductId_key" ON "ContentPostProduct"("contentPostId", "formWebsiteProductId");

-- AddForeignKey
ALTER TABLE "ContentPost" ADD CONSTRAINT "ContentPost_formWebsiteId_fkey" FOREIGN KEY ("formWebsiteId") REFERENCES "FormWebsite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPost" ADD CONSTRAINT "ContentPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPost" ADD CONSTRAINT "ContentPost_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPostProduct" ADD CONSTRAINT "ContentPostProduct_contentPostId_fkey" FOREIGN KEY ("contentPostId") REFERENCES "ContentPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPostProduct" ADD CONSTRAINT "ContentPostProduct_formWebsiteProductId_fkey" FOREIGN KEY ("formWebsiteProductId") REFERENCES "FormWebsiteProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

