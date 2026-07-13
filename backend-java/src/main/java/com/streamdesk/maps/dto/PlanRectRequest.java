package com.streamdesk.maps.dto;

/**
 * Тело PUT /api/maps/{mapId}/plan/rect — прямоугольник отрисовки плана на холсте
 * (в координатах сцены = пикселях изображения). Задаётся ресайзом плана за углы.
 */
public record PlanRectRequest(Integer x, Integer y, Integer width, Integer height) {
}
