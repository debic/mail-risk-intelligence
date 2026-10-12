import type { EmailEntity, EmailRelationship, EntityType } from '../../../shared/types'
import styles from './EntitiesPanel.module.css'

const TYPE_ORDER: { type: EntityType; label: string }[] = [
  { type: 'person', label: 'People' },
  { type: 'organization', label: 'Organizations' },
  { type: 'account', label: 'Accounts' },
  { type: 'amount', label: 'Amounts' },
  { type: 'location', label: 'Locations' },
  { type: 'other', label: 'Other' },
]

/** "requests_payment_to" -> "requests payment to" */
const humanize = (relation: string) => relation.replace(/_/g, ' ')

const MAX_EMAIL_LINKS = 3

interface EntitiesPanelProps {
  entities: EmailEntity[]
  relationships: EmailRelationship[]
  onOpenEmail: (id: string) => void
}

export function EntitiesPanel({ entities, relationships, onOpenEmail }: EntitiesPanelProps) {
  const groups = TYPE_ORDER.map((group) => ({
    ...group,
    items: entities.filter((entity) => entity.type === group.type),
  })).filter((group) => group.items.length > 0)

  return (
    <>
      <section className={styles.section} aria-labelledby="entities-heading">
        <h3 id="entities-heading" className={styles.title}>
          Entities <span className={styles.count}>{entities.length}</span>
        </h3>
        {groups.length === 0 ? (
          <p className={styles.empty}>No people, organizations, accounts or amounts were identified.</p>
        ) : (
          <div className={styles.card}>
            {groups.map((group) => (
              <div key={group.type} className={styles.group}>
                <h4 className={styles.groupLabel}>{group.label}</h4>
                <ul className={styles.entities}>
                  {group.items.map((entity) => (
                    <li key={entity.id} className={styles.entity}>
                      <span className={styles.entityName} data-type={entity.type}>
                        {entity.name}
                      </span>
                      {entity.details && <span className={styles.details}>{entity.details}</span>}
                      {entity.otherEmailIds.length > 0 && (
                        <span className={styles.alsoIn}>
                          Also in{' '}
                          {entity.otherEmailIds.slice(0, MAX_EMAIL_LINKS).map((id, i) => (
                            <span key={id}>
                              {i > 0 && ', '}
                              <button
                                type="button"
                                className={styles.emailLink}
                                onClick={() => onOpenEmail(id)}
                                aria-label={`Open email ${id}`}
                              >
                                {id}
                              </button>
                            </span>
                          ))}
                          {entity.otherEmailIds.length > MAX_EMAIL_LINKS && (
                            <span> +{entity.otherEmailIds.length - MAX_EMAIL_LINKS} more</span>
                          )}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={styles.section} aria-labelledby="relationships-heading">
        <h3 id="relationships-heading" className={styles.title}>
          Relationships <span className={styles.count}>{relationships.length}</span>
        </h3>
        {relationships.length === 0 ? (
          <p className={styles.empty}>No relationships between entities were identified.</p>
        ) : (
          <ul className={styles.card}>
            {relationships.map((rel) => (
              <li key={rel.id} className={styles.relationship}>
                <p className={styles.triple}>
                  <span className={styles.node}>{rel.source.name}</span>
                  <span className={styles.verb}>
                    <span aria-hidden="true">→ </span>
                    {humanize(rel.type)}
                    <span aria-hidden="true"> →</span>
                  </span>
                  <span className={styles.node}>{rel.target.name}</span>
                </p>
                {rel.evidence && <p className={styles.evidence}>“{rel.evidence}”</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
