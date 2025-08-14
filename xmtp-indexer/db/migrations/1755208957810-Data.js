module.exports = class Data1755208957810 {
    name = 'Data1755208957810'

    async up(db) {
        await db.query(`CREATE TABLE "eth_transfer" ("id" character varying NOT NULL, "block_number" integer NOT NULL, "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL, "from" text NOT NULL, "to" text NOT NULL, "value" numeric NOT NULL, "transaction_hash" text NOT NULL, "is_payment" boolean NOT NULL, "status" text, CONSTRAINT "PK_f849b89d852f37ba1732c710660" PRIMARY KEY ("id"))`)
        await db.query(`CREATE INDEX "IDX_a0a446833fc80ca73d59bca148" ON "eth_transfer" ("block_number") `)
        await db.query(`CREATE INDEX "IDX_f095957155bdfdc3a0ea1cda4e" ON "eth_transfer" ("timestamp") `)
        await db.query(`CREATE INDEX "IDX_ba39a0294044c5cdee23099670" ON "eth_transfer" ("from") `)
        await db.query(`CREATE INDEX "IDX_abf0862423a6182e7ec09c9ef0" ON "eth_transfer" ("to") `)
        await db.query(`CREATE INDEX "IDX_3e67bcec6424fbff6fb770188e" ON "eth_transfer" ("transaction_hash") `)
        await db.query(`CREATE INDEX "IDX_bb66db4701116d4c3a30a86e4e" ON "eth_transfer" ("is_payment") `)
        await db.query(`CREATE TABLE "contract_event" ("id" character varying NOT NULL, "contract_address" text NOT NULL, "event_name" text NOT NULL, "block_number" integer NOT NULL, "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL, "transaction_hash" text NOT NULL, "user_address" text, "user_inbox_id" text, "token_id" text, "expires_at" TIMESTAMP WITH TIME ZONE, "reason" text, "args" jsonb NOT NULL, CONSTRAINT "PK_a0a0fdb2918e838e546c3b5fd01" PRIMARY KEY ("id"))`)
        await db.query(`CREATE INDEX "IDX_fd9b422d3b48fe1020fca21cbb" ON "contract_event" ("contract_address") `)
        await db.query(`CREATE INDEX "IDX_2ecc74832913601ae4e6283aba" ON "contract_event" ("event_name") `)
        await db.query(`CREATE INDEX "IDX_5109e9d4e0f68f9c237608f643" ON "contract_event" ("block_number") `)
        await db.query(`CREATE INDEX "IDX_eedf5bd059f411bbb97f5167e4" ON "contract_event" ("transaction_hash") `)
        await db.query(`CREATE INDEX "IDX_74376f8c69d8fefe8ba2ef26ed" ON "contract_event" ("user_address") `)
        await db.query(`CREATE INDEX "IDX_4842ff4e9aa1c1d165d1c77c52" ON "contract_event" ("user_inbox_id") `)
        await db.query(`CREATE TABLE "contract_deployment" ("id" character varying NOT NULL, "contract_address" text NOT NULL, "deployer" text NOT NULL, "block_number" integer NOT NULL, "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL, "transaction_hash" text NOT NULL, "contract_type" text, CONSTRAINT "PK_5f59d0c17faedfba6726fbee123" PRIMARY KEY ("id"))`)
        await db.query(`CREATE INDEX "IDX_44a178454a54fb4d4bf2283beb" ON "contract_deployment" ("contract_address") `)
        await db.query(`CREATE INDEX "IDX_d9f60fe173fdf78b0f841f91e0" ON "contract_deployment" ("deployer") `)
        await db.query(`CREATE INDEX "IDX_faa82af901890e98282c0cf1ab" ON "contract_deployment" ("block_number") `)
        await db.query(`CREATE INDEX "IDX_2f1f5580e278b8c0865d40b560" ON "contract_deployment" ("transaction_hash") `)
    }

    async down(db) {
        await db.query(`DROP TABLE "eth_transfer"`)
        await db.query(`DROP INDEX "public"."IDX_a0a446833fc80ca73d59bca148"`)
        await db.query(`DROP INDEX "public"."IDX_f095957155bdfdc3a0ea1cda4e"`)
        await db.query(`DROP INDEX "public"."IDX_ba39a0294044c5cdee23099670"`)
        await db.query(`DROP INDEX "public"."IDX_abf0862423a6182e7ec09c9ef0"`)
        await db.query(`DROP INDEX "public"."IDX_3e67bcec6424fbff6fb770188e"`)
        await db.query(`DROP INDEX "public"."IDX_bb66db4701116d4c3a30a86e4e"`)
        await db.query(`DROP TABLE "contract_event"`)
        await db.query(`DROP INDEX "public"."IDX_fd9b422d3b48fe1020fca21cbb"`)
        await db.query(`DROP INDEX "public"."IDX_2ecc74832913601ae4e6283aba"`)
        await db.query(`DROP INDEX "public"."IDX_5109e9d4e0f68f9c237608f643"`)
        await db.query(`DROP INDEX "public"."IDX_eedf5bd059f411bbb97f5167e4"`)
        await db.query(`DROP INDEX "public"."IDX_74376f8c69d8fefe8ba2ef26ed"`)
        await db.query(`DROP INDEX "public"."IDX_4842ff4e9aa1c1d165d1c77c52"`)
        await db.query(`DROP TABLE "contract_deployment"`)
        await db.query(`DROP INDEX "public"."IDX_44a178454a54fb4d4bf2283beb"`)
        await db.query(`DROP INDEX "public"."IDX_d9f60fe173fdf78b0f841f91e0"`)
        await db.query(`DROP INDEX "public"."IDX_faa82af901890e98282c0cf1ab"`)
        await db.query(`DROP INDEX "public"."IDX_2f1f5580e278b8c0865d40b560"`)
    }
}
