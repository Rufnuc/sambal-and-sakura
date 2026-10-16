-- AlterTable: optional picture and file link for promotional emails
ALTER TABLE "Campaign" ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "fileUrl" TEXT,
ADD COLUMN     "fileName" TEXT;
