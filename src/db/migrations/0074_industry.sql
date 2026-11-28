ALTER TABLE "organizations" ADD COLUMN "industry" text;--> statement-breakpoint
-- Zeronix trades IT hardware (lib/industries.ts). Other organisations pick theirs when they are set up.
UPDATE "organizations" SET "industry" = 'it_trading' WHERE "id" = 1 AND "industry" IS NULL;
