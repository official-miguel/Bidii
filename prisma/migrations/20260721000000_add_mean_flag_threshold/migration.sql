-- AlterTable: add optional meanFlagThreshold to RankingConfig
ALTER TABLE "RankingConfig" ADD COLUMN "meanFlagThreshold" DOUBLE PRECISION;
