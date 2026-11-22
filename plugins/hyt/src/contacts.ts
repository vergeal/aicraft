import { Database } from "bun:sqlite"

/**
 * 通讯录：AddressBookDB.db 的 Person 与 Department。
 * 客户端并没有把部门关系落全：Department 表在我们看到的账号里是空的，Person 只带 DptId / DptFullName。
 * 所以部门树优先读 Department，读不到时用 Person 里的部门字段聚出扁平列表，父级关系留给 UI 按全名展示。
 */

export interface Contact {
  readonly personId: number
  readonly account: string
  readonly name: string
  readonly remark: string
  readonly pinyin: string
  readonly departmentId: number
  readonly departmentFullName: string
  readonly departmentShortName: string
  readonly phone: string
  readonly mail: string
  readonly isFriend: boolean
  readonly isSpecial: boolean
  readonly isLeader: boolean
}

export interface DepartmentNode {
  readonly id: number
  readonly name: string
  readonly fullName: string
  readonly people: number
  readonly children: readonly DepartmentNode[]
}

export function openReadonly(path: string) {
  const db = new Database(path, { readonly: true })
  db.exec("PRAGMA busy_timeout = 3000")
  return db
}

export function listContacts(db: Database, input: { query?: string; limit?: number } = {}): Contact[] {
  const needle = input.query?.trim() ?? ""
  const pattern = `%${needle.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
  const rows = db
    .query<PersonRow, [string, number]>(
      `select ${PERSON_COLUMNS} from Person
       where Name like ?1 escape '\\'
          or Remark like ?1 escape '\\'
          or Account like ?1 escape '\\'
          or PinYin like ?1 escape '\\'
          or DptFullName like ?1 escape '\\'
       order by IsFriend desc, Name asc limit ?2`,
    )
    .all(pattern, Math.min(Math.max(input.limit ?? 30, 1), 200))
  return rows.map(toContact)
}

/** 按账号或姓名精确找一个联系人；账号既接受 cs… 也接受裸 UserName。 */
export function findContacts(db: Database, input: { account?: string; name?: string }): Contact[] {
  const account = input.account?.trim() ?? ""
  const name = input.name?.trim() ?? ""
  if (account.length === 0 && name.length === 0) return []
  const rows = db
    .query<PersonRow, [string, string]>(
      `select ${PERSON_COLUMNS} from Person
       where (?1 <> '' and (Account = ?1 or Account = 'cs' || ?1))
          or (?2 <> '' and (Name = ?2 or Remark = ?2))
       limit 20`,
    )
    .all(account, name)
  return rows.map(toContact)
}

export function departmentTree(db: Database): DepartmentNode[] {
  const rows = db
    .query<DepartmentRow, []>(
      "select DptID as id, RootID as rootId, DptFullName as fullName, DptShortName as shortName, PeopleNum as people from Department order by DptOrder asc, DptID asc",
    )
    .all()
  if (rows.length > 0) {
    return rows.map((row) => ({
      id: row.id,
      name: (row.shortName ?? "").trim() || (row.fullName ?? "").trim(),
      fullName: (row.fullName ?? "").trim(),
      people: row.people ?? 0,
      children: [],
    }))
  }
  // Department 为空时，用 Person 的部门字段聚出同样的列表。
  return db
    .query<{ id: number; fullName: string; people: number }, []>(
      `select DptId as id, DptFullName as fullName, count(*) as people from Person
       where DptFullName is not null and DptFullName <> '' group by DptId, DptFullName order by people desc`,
    )
    .all()
    .map((row) => ({ id: row.id, name: row.fullName, fullName: row.fullName, people: row.people, children: [] }))
}

const PERSON_COLUMNS =
  "PersonID, Account, Name, Remark, PinYin, DptId, DptFullName, DptShortName, Cellphone, Telephone, Mail, IsFriend, IsSpecial, IsLeader"

interface PersonRow {
  readonly PersonID: number | null
  readonly Account: string | null
  readonly Name: string | null
  readonly Remark: string | null
  readonly PinYin: string | null
  readonly DptId: number | null
  readonly DptFullName: string | null
  readonly DptShortName: string | null
  readonly Cellphone: string | null
  readonly Telephone: string | null
  readonly Mail: string | null
  readonly IsFriend: number | null
  readonly IsSpecial: number | null
  readonly IsLeader: number | null
}

interface DepartmentRow {
  readonly id: number
  readonly rootId: number | null
  readonly fullName: string | null
  readonly shortName: string | null
  readonly people: number | null
}

function toContact(row: PersonRow): Contact {
  return {
    personId: row.PersonID ?? 0,
    account: (row.Account ?? "").trim(),
    name: (row.Name ?? "").trim(),
    remark: (row.Remark ?? "").trim(),
    pinyin: (row.PinYin ?? "").trim(),
    departmentId: row.DptId ?? 0,
    departmentFullName: (row.DptFullName ?? "").trim(),
    departmentShortName: (row.DptShortName ?? "").trim(),
    phone: (row.Cellphone ?? "").trim() || (row.Telephone ?? "").trim(),
    mail: (row.Mail ?? "").trim(),
    isFriend: row.IsFriend === 1,
    isSpecial: row.IsSpecial === 1,
    isLeader: row.IsLeader === 1,
  }
}
