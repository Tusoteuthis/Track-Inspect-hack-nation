import { isAnswered } from "@/lib/review/ws3Mappers";
import type { OpenQuestion } from "@/lib/expert/contracts";
import styles from "./review.module.css";

/** Gaps for the spoken debrief (WS3 OpenQuestion), each marked answered or unanswered. */
export function OpenQuestions({ questions }: { questions: OpenQuestion[] }) {
  const open = questions.filter(q => !isAnswered(q)).length;
  return (
    <section className={styles.panel} aria-labelledby="open-questions-title">
      <h2 id="open-questions-title">Open questions and gaps</h2>
      <p className={styles.hint}>
        {questions.length === 0 ? "No open questions." : `${open} of ${questions.length} still unanswered.`}
      </p>
      <ul className={styles.questions}>
        {questions.map(q => {
          const answered = isAnswered(q);
          return (
            <li key={q.open_question_id} data-answered={answered ? "yes" : "no"}>
              <span className={`${styles.answerState} ${answered ? styles.answered : styles.unanswered}`}>
                <span aria-hidden="true">{answered ? "✓ " : "○ "}</span>
                {answered ? "Answered" : "Unanswered"}
              </span>
              <p className={styles.question}>{q.missing_fact}</p>
              <p className={styles.hint}>Why it matters: {q.why_it_matters}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
