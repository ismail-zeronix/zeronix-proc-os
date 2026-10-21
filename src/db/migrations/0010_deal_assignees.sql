CREATE TABLE "deal_assignees" (
	"deal_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "deal_assignees_deal_id_user_id_pk" PRIMARY KEY("deal_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "deal_assignees" ADD CONSTRAINT "deal_assignees_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_assignees" ADD CONSTRAINT "deal_assignees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deal_assignees_user_idx" ON "deal_assignees" USING btree ("user_id");
--> statement-breakpoint
INSERT INTO "deal_assignees" ("deal_id", "user_id", "position") SELECT "id", "owner_id", 0 FROM "deals" WHERE "owner_id" IS NOT NULL ON CONFLICT DO NOTHING;
