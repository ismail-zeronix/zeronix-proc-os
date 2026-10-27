CREATE TABLE "project_task_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"type_key" text NOT NULL,
	"checklist_group" text NOT NULL,
	"title" text NOT NULL,
	"offset_days" integer,
	"required" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "checklist_group" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "position" integer;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "offset_days" integer;--> statement-breakpoint
ALTER TABLE "project_task_templates" ADD CONSTRAINT "project_task_templates_type_key_project_types_key_fk" FOREIGN KEY ("type_key") REFERENCES "public"."project_types"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_task_templates_type_idx" ON "project_task_templates" USING btree ("type_key","checklist_group","position");--> statement-breakpoint
INSERT INTO "project_task_templates" ("type_key", "checklist_group", "title", "offset_days", "required", "position") VALUES
	('cctv', 'survey', 'Site survey: camera positions, cable routes, NVR location', 1, false, 0),
	('cctv', 'survey', 'Camera layout drawing', 3, false, 1),
	('cctv', 'survey', 'BOQ and proposal sent to the customer', 4, false, 2),
	('cctv', 'work', 'Order materials', 0, false, 0),
	('cctv', 'work', 'Cable laying and containment', 2, false, 1),
	('cctv', 'work', 'Mount cameras', 4, false, 2),
	('cctv', 'work', 'Install and configure the NVR', 5, false, 3),
	('cctv', 'work', 'Set camera angles and focus with the customer', 6, true, 4),
	('cctv', 'work', 'Set up remote and mobile viewing', 6, false, 5),
	('cctv', 'handover', 'Customer training on viewing and playback', 7, true, 0),
	('cctv', 'handover', 'As-built drawing and camera list', 8, true, 1),
	('cctv', 'handover', 'Handover and customer sign-off', 8, true, 2);
--> statement-breakpoint
INSERT INTO "project_task_templates" ("type_key", "checklist_group", "title", "offset_days", "required", "position") VALUES
	('networking', 'survey', 'Site survey: number of points, rack location, cable routes', 1, false, 0),
	('networking', 'survey', 'Rack and cable route plan', 3, false, 1),
	('networking', 'survey', 'BOQ and proposal sent to the customer', 4, false, 2),
	('networking', 'work', 'Order materials', 0, false, 0),
	('networking', 'work', 'Containment and cable pulling', 2, false, 1),
	('networking', 'work', 'Terminate points and patch panels', 5, false, 2),
	('networking', 'work', 'Rack dressing and labelling', 6, true, 3),
	('networking', 'work', 'Configure switches, firewall and Wi-Fi', 7, false, 4),
	('networking', 'handover', 'Cable test / certification report', 8, true, 0),
	('networking', 'handover', 'Network diagram and IP list', 9, true, 1),
	('networking', 'handover', 'Handover and customer sign-off', 9, true, 2);
--> statement-breakpoint
INSERT INTO "project_task_templates" ("type_key", "checklist_group", "title", "offset_days", "required", "position") VALUES
	('server_room', 'survey', 'Site survey: space, power, cooling, access', 1, false, 0),
	('server_room', 'survey', 'Room layout and rack elevation', 3, false, 1),
	('server_room', 'survey', 'BOQ and proposal sent to the customer', 5, false, 2),
	('server_room', 'work', 'Order materials', 0, false, 0),
	('server_room', 'work', 'Install racks, PDUs and UPS', 3, false, 1),
	('server_room', 'work', 'Coordinate cooling / AC work', 4, false, 2),
	('server_room', 'work', 'Install servers and network equipment', 6, false, 3),
	('server_room', 'work', 'Cable management and labelling', 7, true, 4),
	('server_room', 'handover', 'Power failover and UPS test', 8, true, 0),
	('server_room', 'handover', 'Documentation: rack layout, IPs, passwords', 9, true, 1),
	('server_room', 'handover', 'Handover and customer sign-off', 9, true, 2);
--> statement-breakpoint
INSERT INTO "project_task_templates" ("type_key", "checklist_group", "title", "offset_days", "required", "position") VALUES
	('access_control', 'survey', 'Site survey and door schedule', 1, false, 0),
	('access_control', 'survey', 'Check door hardware and lock types', 2, false, 1),
	('access_control', 'survey', 'BOQ and proposal sent to the customer', 4, false, 2),
	('access_control', 'work', 'Order materials', 0, false, 0),
	('access_control', 'work', 'Cabling to doors and controllers', 2, false, 1),
	('access_control', 'work', 'Install readers, locks and controllers', 4, false, 2),
	('access_control', 'work', 'Programming and user enrolment', 6, false, 3),
	('access_control', 'handover', 'Test every door', 7, true, 0),
	('access_control', 'handover', 'Fire alarm release test', 7, true, 1),
	('access_control', 'handover', 'Admin training', 8, true, 2),
	('access_control', 'handover', 'Handover and customer sign-off', 8, true, 3);
--> statement-breakpoint
INSERT INTO "project_task_templates" ("type_key", "checklist_group", "title", "offset_days", "required", "position") VALUES
	('av', 'survey', 'Room survey and requirements', 1, false, 0),
	('av', 'survey', 'System design and equipment list', 3, false, 1),
	('av', 'survey', 'BOQ and proposal sent to the customer', 4, false, 2),
	('av', 'work', 'Order materials', 0, false, 0),
	('av', 'work', 'Cabling and mounting', 3, false, 1),
	('av', 'work', 'Install displays and audio', 5, false, 2),
	('av', 'work', 'Set up conferencing and program controls', 6, false, 3),
	('av', 'handover', 'Test calls and presets with the customer', 7, true, 0),
	('av', 'handover', 'User training', 7, true, 1),
	('av', 'handover', 'Handover and customer sign-off', 8, true, 2);
--> statement-breakpoint
INSERT INTO "project_task_templates" ("type_key", "checklist_group", "title", "offset_days", "required", "position") VALUES
	('it_fitout', 'survey', 'Requirements and user list', 1, false, 0),
	('it_fitout', 'survey', 'Site visit', 2, false, 1),
	('it_fitout', 'survey', 'BOQ and proposal sent to the customer', 4, false, 2),
	('it_fitout', 'work', 'Order hardware and licences', 0, false, 0),
	('it_fitout', 'work', 'Network and internet setup', 3, false, 1),
	('it_fitout', 'work', 'Set up PCs and laptops', 5, false, 2),
	('it_fitout', 'work', 'Email, accounts and shared drives', 6, false, 3),
	('it_fitout', 'work', 'Printers and scanners', 6, false, 4),
	('it_fitout', 'handover', 'User test and training', 7, true, 0),
	('it_fitout', 'handover', 'Asset list and passwords handed over', 8, true, 1),
	('it_fitout', 'handover', 'Handover and customer sign-off', 8, true, 2);
--> statement-breakpoint
INSERT INTO "project_task_templates" ("type_key", "checklist_group", "title", "offset_days", "required", "position") VALUES
	('software', 'survey', 'Requirements meeting', 1, false, 0),
	('software', 'survey', 'Scope, sitemap or specification', 4, false, 1),
	('software', 'survey', 'Proposal sent to the customer', 6, false, 2),
	('software', 'work', 'Design approved by the customer', 7, true, 0),
	('software', 'work', 'Development', 21, false, 1),
	('software', 'work', 'Content entry', 25, false, 2),
	('software', 'work', 'Testing', 28, true, 3),
	('software', 'handover', 'Go-live', 30, true, 0),
	('software', 'handover', 'Training and documentation', 31, false, 1),
	('software', 'handover', 'Handover and customer sign-off', 32, true, 2);
--> statement-breakpoint
INSERT INTO "project_task_templates" ("type_key", "checklist_group", "title", "offset_days", "required", "position") VALUES
	('other', 'survey', 'Site survey', 1, false, 0),
	('other', 'survey', 'BOQ and proposal sent to the customer', 3, false, 1),
	('other', 'work', 'Order materials', 0, false, 0),
	('other', 'work', 'Installation', 3, false, 1),
	('other', 'handover', 'Testing', 5, true, 0),
	('other', 'handover', 'Handover and customer sign-off', 6, true, 1);
