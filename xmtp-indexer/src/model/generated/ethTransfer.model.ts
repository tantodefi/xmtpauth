import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, IntColumn as IntColumn_, Index as Index_, DateTimeColumn as DateTimeColumn_, StringColumn as StringColumn_, BigIntColumn as BigIntColumn_, BooleanColumn as BooleanColumn_} from "@subsquid/typeorm-store"

@Entity_()
export class EthTransfer {
    constructor(props?: Partial<EthTransfer>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_()
    @IntColumn_({nullable: false})
    blockNumber!: number

    @Index_()
    @DateTimeColumn_({nullable: false})
    timestamp!: Date

    @Index_()
    @StringColumn_({nullable: false})
    from!: string

    @Index_()
    @StringColumn_({nullable: false})
    to!: string

    @BigIntColumn_({nullable: false})
    value!: bigint

    @Index_()
    @StringColumn_({nullable: false})
    transactionHash!: string

    @Index_()
    @BooleanColumn_({nullable: false})
    isPayment!: boolean

    @StringColumn_({nullable: true})
    status!: string | undefined | null

    @StringColumn_({nullable: true})
    tokenType!: string | undefined | null
}
