-- AlterTable: the online order discount ("order direct and save 10%"), kept separately from code discounts
ALTER TABLE "Order" ADD COLUMN     "onlineDiscount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN     "onlineDiscountLabel" TEXT;
