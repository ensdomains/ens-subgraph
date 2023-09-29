module.exports = class Data1695983531460 {
    name = 'Data1695983531460'

    async up(db) {
        await db.query(`CREATE TABLE "burn" ("id" character varying NOT NULL, "block" integer NOT NULL, "address" text NOT NULL, "value" numeric NOT NULL, "tx_hash" text NOT NULL, CONSTRAINT "PK_dcb4f14ee4534154b31116553f0" PRIMARY KEY ("id"))`)
        await db.query(`CREATE INDEX "IDX_fc3726cbc7f5d4edf4340ae298" ON "burn" ("address") `)
        await db.query(`CREATE TABLE "gravatar" ("id" character varying NOT NULL, "owner" bytea NOT NULL, "display_name" text NOT NULL, "image_url" text NOT NULL, CONSTRAINT "PK_e887b4dffafd686933930ef25bb" PRIMARY KEY ("id"))`)
    }

    async down(db) {
        await db.query(`DROP TABLE "burn"`)
        await db.query(`DROP INDEX "public"."IDX_fc3726cbc7f5d4edf4340ae298"`)
        await db.query(`DROP TABLE "gravatar"`)
    }
}
