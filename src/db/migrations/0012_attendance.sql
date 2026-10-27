CREATE TABLE "attendance_absences" (
	"user_id" integer NOT NULL,
	"day" date NOT NULL,
	"kind" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_absences_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
CREATE TABLE "attendance_punches" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"day" date NOT NULL,
	"in_at" timestamp with time zone DEFAULT now() NOT NULL,
	"out_at" timestamp with time zone,
	"late" boolean DEFAULT false NOT NULL,
	"in_reason" text DEFAULT '' NOT NULL,
	"early" boolean DEFAULT false NOT NULL,
	"out_reason" text DEFAULT '' NOT NULL,
	"auto_closed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attendance_absences" ADD CONSTRAINT "attendance_absences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_absences" ADD CONSTRAINT "attendance_absences_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_punches" ADD CONSTRAINT "attendance_punches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendance_punches_user_day_idx" ON "attendance_punches" USING btree ("user_id","day");