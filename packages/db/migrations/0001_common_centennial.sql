ALTER TABLE "candidates" ADD COLUMN "firebase_uid" text;--> statement-breakpoint
ALTER TABLE "employers" ADD COLUMN "firebase_uid" text;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_firebase_uid_unique" UNIQUE("firebase_uid");--> statement-breakpoint
ALTER TABLE "employers" ADD CONSTRAINT "employers_firebase_uid_unique" UNIQUE("firebase_uid");