CREATE TABLE "web_chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"chat_id" integer NOT NULL,
	"sender" text NOT NULL,
	"user_id" integer,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "web_chats" (
	"id" serial PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"company" text DEFAULT '' NOT NULL,
	"lead_at" timestamp with time zone,
	"page_url" text DEFAULT '' NOT NULL,
	"page_title" text DEFAULT '' NOT NULL,
	"referrer" text DEFAULT '' NOT NULL,
	"user_agent" text DEFAULT '' NOT NULL,
	"ip" text DEFAULT '' NOT NULL,
	"agent_id" integer,
	"accepted_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"closed_by" text,
	"last_message_at" timestamp with time zone,
	"visitor_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"agent_last_read_id" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "web_chats_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "web_chat_messages" ADD CONSTRAINT "web_chat_messages_chat_id_web_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."web_chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_chat_messages" ADD CONSTRAINT "web_chat_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_chats" ADD CONSTRAINT "web_chats_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "web_chat_messages_chat_idx" ON "web_chat_messages" USING btree ("chat_id","id");--> statement-breakpoint
CREATE INDEX "web_chats_status_idx" ON "web_chats" USING btree ("status","last_message_at");--> statement-breakpoint
CREATE INDEX "web_chats_agent_idx" ON "web_chats" USING btree ("agent_id");