import styles from '../styles/Home.module.css'

type Props = {
  message?: string
  inline?: boolean
}

export default function LoadingSpinner({ message, inline }: Props) {
  if (inline) {
    return (
      <div className={styles.spinnerInline}>
        <div className={styles.spinner} />
        {message && <span>{message}</span>}
      </div>
    )
  }

  return (
    <div className={styles.loading}>
      <div className={styles.spinner} />
      {message && <span>{message}</span>}
    </div>
  )
}
