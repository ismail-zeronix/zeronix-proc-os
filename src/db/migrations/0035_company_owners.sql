CREATE TABLE "company_owners" (
	"company_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "company_owners_company_id_user_id_pk" PRIMARY KEY("company_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "company_owners" ADD CONSTRAINT "company_owners_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_owners" ADD CONSTRAINT "company_owners_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_owners_user_idx" ON "company_owners" USING btree ("user_id");--> statement-breakpoint
-- every company keeps its current owner as the first (main) owner
INSERT INTO "company_owners" ("company_id", "user_id", "position") SELECT "id", "owner_id", 0 FROM "companies" WHERE "owner_id" IS NOT NULL;
