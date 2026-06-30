package com.streamdesk.estimate.dto;

/**
 * Ручное переопределение цены/аренды позиции (SD-152): «у кого / где / за сколько».
 *
 * Если по ТЗ позиции нет на складе (или цену надо взять у субподрядчика),
 * пользователь задаёт цену вручную с указанием поставщика и локации. Такое
 * переопределение имеет высший приоритет и попадает в итог сметы.
 *
 * @param name           название позиции, к которой относится переопределение
 * @param type           тип оборудования (audio/lighting/...), опционально
 * @param unitPrice      цена за единицу/смену (за сколько)
 * @param rentalVendor   у кого арендуем (поставщик/субподрядчик)
 * @param rentalLocation где забираем/где находится
 */
public record PriceOverride(
        String name,
        String type,
        double unitPrice,
        String rentalVendor,
        String rentalLocation
) {
}
