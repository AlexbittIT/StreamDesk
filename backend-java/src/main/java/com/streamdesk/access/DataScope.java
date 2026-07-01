package com.streamdesk.access;

/**
 * Уровень видимости данных роли — насколько широкий срез записей видит сотрудник.
 *
 * <ul>
 *   <li>{@link #OWN} — только свои записи (созданные/назначенные пользователю);</li>
 *   <li>{@link #DEPARTMENT} — записи своего отдела (по полю department пользователей);</li>
 *   <li>{@link #ALL} — всё по своим компаниям (поведение по умолчанию, как до фичи).</li>
 * </ul>
 *
 * Разделение между компаниями действует ВСЕГДА и не зависит от уровня: даже {@link #ALL}
 * ограничен компаниями пользователя.
 */
public enum DataScope {
    OWN,
    DEPARTMENT,
    ALL;

    /**
     * Разбор значения из БД/запроса. Неизвестное или пустое значение трактуем как {@link #ALL}
     * — это сохраняет поведение старых ролей (без поля), которые до фичи видели всё по компании.
     */
    public static DataScope parse(String value) {
        if (value == null) {
            return ALL;
        }
        return switch (value.trim().toLowerCase()) {
            case "own", "self" -> OWN;
            case "department", "dept" -> DEPARTMENT;
            default -> ALL;
        };
    }

    /** Каноническое строковое значение для хранения в БД. */
    public String dbValue() {
        return name().toLowerCase();
    }
}
