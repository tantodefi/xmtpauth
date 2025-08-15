module.exports = class Data1755271382770 {
    name = 'Data1755271382770'

    async up(db) {
        await db.query(`ALTER TABLE "eth_transfer" ADD "token_type" text`)
    }

    async down(db) {
        await db.query(`ALTER TABLE "eth_transfer" DROP COLUMN "token_type"`)
    }
}
