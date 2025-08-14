import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_, Index as Index_, IntColumn as IntColumn_, DateTimeColumn as DateTimeColumn_, JSONColumn as JSONColumn_} from "@subsquid/typeorm-store"

@Entity_()
export class ContractEvent {
    constructor(props?: Partial<ContractEvent>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_()
    @StringColumn_({nullable: false})
    contractAddress!: string

    @Index_()
    @StringColumn_({nullable: false})
    eventName!: string

    @Index_()
    @IntColumn_({nullable: false})
    blockNumber!: number

    @DateTimeColumn_({nullable: false})
    timestamp!: Date

    @Index_()
    @StringColumn_({nullable: false})
    transactionHash!: string

    @Index_()
    @StringColumn_({nullable: true})
    userAddress!: string | undefined | null

    @Index_()
    @StringColumn_({nullable: true})
    userInboxId!: string | undefined | null

    @StringColumn_({nullable: true})
    tokenId!: string | undefined | null

    @DateTimeColumn_({nullable: true})
    expiresAt!: Date | undefined | null

    @StringColumn_({nullable: true})
    reason!: string | undefined | null

    @JSONColumn_({nullable: false})
    args!: unknown
}
