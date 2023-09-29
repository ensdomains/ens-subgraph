import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_} from "typeorm"

@Entity_()
export class Gravatar {
    constructor(props?: Partial<Gravatar>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Column_("bytea", {nullable: false})
    owner!: Uint8Array

    @Column_("text", {nullable: false})
    displayName!: string

    @Column_("text", {nullable: false})
    imageUrl!: string
}
