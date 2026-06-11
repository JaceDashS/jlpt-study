import { cx } from "../../styles.ts";
import type { AvailableBook } from "../../domain/curriculumFiles.ts";

export function HomeHeaderSection({
  availableBooks,
  onSwitchBook,
  selectedBookId,
  today,
}: {
  availableBooks: AvailableBook[];
  onSwitchBook: (bookId: string) => void;
  selectedBookId: string;
  today: string;
}) {
  return (
    <>
      <div className={cx("home-top-bar")}>
        <p className={cx("home-top-date")}>오늘 날짜: {today}</p>
      </div>

      {availableBooks.length > 1 && (
        <div className={cx("home-book-selector")}>
          <label htmlFor="book-select">교재</label>
          <select id="book-select" value={selectedBookId} onChange={(event) => onSwitchBook(event.target.value)}>
            {availableBooks.map((book) => (
              <option key={book.id} value={book.id}>
                {book.title}
              </option>
            ))}
          </select>
        </div>
      )}
    </>
  );
}
