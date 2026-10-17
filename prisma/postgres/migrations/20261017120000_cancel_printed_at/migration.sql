-- AlterTable: when the kitchen "CANCELLED - STOP" ticket was printed (cloud printer or tablet USB printer)
ALTER TABLE "Order" ADD COLUMN     "cancelPrintedAt" TIMESTAMP(3);
