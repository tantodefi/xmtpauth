module.exports = class ResetForComprehensive1755305135107 {
  name = "ResetForComprehensive1755305135107";

  async up(db) {
    // Drop all existing tables to start fresh
    await db.query(`DROP TABLE IF EXISTS "eth_transfer" CASCADE`);
    await db.query(`DROP TABLE IF EXISTS "contract_deployment" CASCADE`);
    await db.query(`DROP TABLE IF EXISTS "contract_event" CASCADE`);

    // Create comprehensive schema tables
    await db.query(
      `CREATE TABLE "eth_transfer" ("id" character varying NOT NULL, "block_number" integer NOT NULL, "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL, "transaction_hash" text NOT NULL, "from" text NOT NULL, "to" text NOT NULL, "value" text NOT NULL, "token_type" character varying NOT NULL, "is_payment" boolean NOT NULL, "status" character varying, CONSTRAINT "PK_eth_transfer" PRIMARY KEY ("id"))`,
    );
    await db.query(
      `CREATE INDEX "IDX_eth_transfer_block_number" ON "eth_transfer" ("block_number") `,
    );
    await db.query(
      `CREATE INDEX "IDX_eth_transfer_timestamp" ON "eth_transfer" ("timestamp") `,
    );
    await db.query(
      `CREATE INDEX "IDX_eth_transfer_to" ON "eth_transfer" ("to") `,
    );
    await db.query(
      `CREATE INDEX "IDX_eth_transfer_from" ON "eth_transfer" ("from") `,
    );
    await db.query(
      `CREATE INDEX "IDX_eth_transfer_is_payment" ON "eth_transfer" ("is_payment") `,
    );

    await db.query(
      `CREATE TABLE "contract_deployment" ("id" character varying NOT NULL, "block_number" integer NOT NULL, "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL, "transaction_hash" text NOT NULL, "factory_address" text NOT NULL, "creator_address" text NOT NULL, "contract_address" text NOT NULL, "group_name" text NOT NULL, CONSTRAINT "PK_contract_deployment" PRIMARY KEY ("id"))`,
    );
    await db.query(
      `CREATE INDEX "IDX_contract_deployment_block_number" ON "contract_deployment" ("block_number") `,
    );
    await db.query(
      `CREATE INDEX "IDX_contract_deployment_timestamp" ON "contract_deployment" ("timestamp") `,
    );
    await db.query(
      `CREATE INDEX "IDX_contract_deployment_factory_address" ON "contract_deployment" ("factory_address") `,
    );
    await db.query(
      `CREATE INDEX "IDX_contract_deployment_creator_address" ON "contract_deployment" ("creator_address") `,
    );
    await db.query(
      `CREATE INDEX "IDX_contract_deployment_contract_address" ON "contract_deployment" ("contract_address") `,
    );

    await db.query(
      `CREATE TABLE "contract_event" ("id" character varying NOT NULL, "block_number" integer NOT NULL, "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL, "transaction_hash" text NOT NULL, "contract_address" text NOT NULL, "event_name" text NOT NULL, "user_address" text, "user_inbox_id" text, "token_id" text, "expires_at" text, "reason" text, "args" jsonb NOT NULL, CONSTRAINT "PK_contract_event" PRIMARY KEY ("id"))`,
    );
    await db.query(
      `CREATE INDEX "IDX_contract_event_block_number" ON "contract_event" ("block_number") `,
    );
    await db.query(
      `CREATE INDEX "IDX_contract_event_timestamp" ON "contract_event" ("timestamp") `,
    );
    await db.query(
      `CREATE INDEX "IDX_contract_event_contract_address" ON "contract_event" ("contract_address") `,
    );
    await db.query(
      `CREATE INDEX "IDX_contract_event_event_name" ON "contract_event" ("event_name") `,
    );
    await db.query(
      `CREATE INDEX "IDX_contract_event_user_address" ON "contract_event" ("user_address") `,
    );
    await db.query(
      `CREATE INDEX "IDX_contract_event_user_inbox_id" ON "contract_event" ("user_inbox_id") `,
    );
  }

  async down(db) {
    await db.query(`DROP TABLE "contract_event"`);
    await db.query(`DROP TABLE "contract_deployment"`);
    await db.query(`DROP TABLE "eth_transfer"`);
  }
};
