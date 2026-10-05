CREATE SCHEMA IF NOT EXISTS "templog";
--> statement-breakpoint
CREATE TYPE "templog"."kitchen_role" AS ENUM('owner', 'staff');--> statement-breakpoint
CREATE TYPE "templog"."platform" AS ENUM('ios', 'android');--> statement-breakpoint
CREATE TYPE "templog"."unit" AS ENUM('F', 'C');--> statement-breakpoint
CREATE TABLE "templog"."account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "templog"."checkpoints" (
	"id" text NOT NULL,
	"kitchen_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"limits" jsonb NOT NULL,
	"cadence" jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "checkpoints_kitchen_id_id_pk" PRIMARY KEY("kitchen_id","id")
);
--> statement-breakpoint
CREATE TABLE "templog"."cooling_items" (
	"id" text NOT NULL,
	"kitchen_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"start_value_f" double precision,
	"stage1_reading_id" text,
	"stage1_at" timestamp with time zone,
	"stage2_reading_id" text,
	"status" text NOT NULL,
	"completed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"fail_reason" text,
	"discarded_at" timestamp with time zone,
	"corrective_action" jsonb,
	"initials" text,
	"note" text,
	CONSTRAINT "cooling_items_kitchen_id_id_pk" PRIMARY KEY("kitchen_id","id")
);
--> statement-breakpoint
CREATE TABLE "templog"."devices" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expo_push_token" text NOT NULL,
	"platform" "templog"."platform" NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "devices_expo_push_token_unique" UNIQUE("expo_push_token")
);
--> statement-breakpoint
CREATE TABLE "templog"."kitchen_members" (
	"kitchen_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "templog"."kitchen_role" NOT NULL,
	"display_name" text NOT NULL,
	"initials" text,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kitchen_members_kitchen_id_user_id_pk" PRIMARY KEY("kitchen_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "templog"."kitchens" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"name" text NOT NULL,
	"tz" text NOT NULL,
	"unit" "templog"."unit" DEFAULT 'F' NOT NULL,
	"opening_hours" jsonb NOT NULL,
	"invite_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"server_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_summary_week" text,
	CONSTRAINT "kitchens_invite_code_unique" UNIQUE("invite_code")
);
--> statement-breakpoint
CREATE TABLE "templog"."readings" (
	"id" text NOT NULL,
	"kitchen_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"checkpoint_id" text,
	"cooling_item_id" text,
	"scheduled_for" timestamp with time zone,
	"taken_at" timestamp with time zone NOT NULL,
	"value_f" double precision NOT NULL,
	"result" text NOT NULL,
	"fail_reason" text,
	"corrective_action" jsonb,
	"initials" text NOT NULL,
	"source" text NOT NULL,
	CONSTRAINT "readings_kitchen_id_id_pk" PRIMARY KEY("kitchen_id","id")
);
--> statement-breakpoint
CREATE TABLE "templog"."session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "templog"."user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "templog"."verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "templog"."account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "templog"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templog"."checkpoints" ADD CONSTRAINT "checkpoints_kitchen_id_kitchens_id_fk" FOREIGN KEY ("kitchen_id") REFERENCES "templog"."kitchens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templog"."cooling_items" ADD CONSTRAINT "cooling_items_kitchen_id_kitchens_id_fk" FOREIGN KEY ("kitchen_id") REFERENCES "templog"."kitchens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templog"."devices" ADD CONSTRAINT "devices_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "templog"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templog"."kitchen_members" ADD CONSTRAINT "kitchen_members_kitchen_id_kitchens_id_fk" FOREIGN KEY ("kitchen_id") REFERENCES "templog"."kitchens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templog"."kitchen_members" ADD CONSTRAINT "kitchen_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "templog"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templog"."kitchens" ADD CONSTRAINT "kitchens_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "templog"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templog"."readings" ADD CONSTRAINT "readings_kitchen_id_kitchens_id_fk" FOREIGN KEY ("kitchen_id") REFERENCES "templog"."kitchens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templog"."session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "templog"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "templog"."account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "checkpoints_kitchen_server_updated_idx" ON "templog"."checkpoints" USING btree ("kitchen_id","server_updated_at");--> statement-breakpoint
CREATE INDEX "cooling_items_kitchen_server_updated_idx" ON "templog"."cooling_items" USING btree ("kitchen_id","server_updated_at");--> statement-breakpoint
CREATE INDEX "devices_user_id_idx" ON "templog"."devices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "kitchen_members_user_id_idx" ON "templog"."kitchen_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kitchens_owner_user_id_idx" ON "templog"."kitchens" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "readings_kitchen_server_updated_idx" ON "templog"."readings" USING btree ("kitchen_id","server_updated_at");--> statement-breakpoint
CREATE INDEX "readings_kitchen_taken_idx" ON "templog"."readings" USING btree ("kitchen_id","taken_at");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "templog"."session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "templog"."verification" USING btree ("identifier");