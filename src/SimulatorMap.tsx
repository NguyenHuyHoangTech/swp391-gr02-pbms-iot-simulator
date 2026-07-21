/**
 * @Author: Nguyen Huu Thanh (Member 5)
 * @Date: 2026-07-21
 * @Description: Bản đồ 2D mô phỏng mặt bằng bãi giữ xe (zone/slot/gate) dùng
 * react-konva, hỗ trợ pan/zoom bằng chuột và click vào từng slot để giả lập
 * cảm biến chiếm dụng (occupied/disabled).
 * @Dependencies:
 * - react-konva, konva
 * - antd (Button, Select)
 * - @ant-design/icons
 */
import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Stage, Layer, Line, Group, Rect, Text as KonvaText, Label, Tag } from 'react-konva';
import Konva from 'konva';

const GRID_SIZE = 50;

const getVehicleDimensions = (typeId, vehicleTypes) => {
  const type = vehicleTypes.find(v => v.id === typeId);
  if (type) {
    const w = type.matrixWidth || 3;
    const h = type.matrixHeight || 6;
    return { width: w * GRID_SIZE, height: h * GRID_SIZE };
  }
  return { width: 3 * GRID_SIZE, height: 6 * GRID_SIZE };
};

export const SimulatorMap = forwardRef(({ floors, zones, gates, slots, vehicleTypes, selectedFloorId, toggleSlot }: any, ref: any) => {
  const activeFloor = floors.find(f => f.id === selectedFloorId);
  const mapCols = activeFloor?.mapCols || 60;
  const mapRows = activeFloor?.mapRows || 40;

  const containerRef = useRef(null);
  const stageRef = useRef(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [stageScale, setStageScale] = useState(1);
  const [defaultScale, setDefaultScale] = useState(1);

  const visibleZones = zones.filter(z => z.floorId === selectedFloorId);
  const visibleGates = gates.filter((g: any) => g.floorId === selectedFloorId);

  useImperativeHandle(ref, () => ({
    handleZoomFit,
    handleZoomZone
  }));

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          setContainerSize({
            width: entry.contentRect.width,
            height: entry.contentRect.height
          });
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (containerSize.width > 0 && containerSize.height > 0) {
      const mapW = mapCols * GRID_SIZE;
      const mapH = mapRows * GRID_SIZE;

      const scale = Math.min(containerSize.width / mapW, containerSize.height / mapH) * 0.95;
      const minScaleLocked = Math.min(scale, 1);

      setDefaultScale(minScaleLocked);
      setStageScale(minScaleLocked);

      setStagePos({
        x: (containerSize.width - mapW * minScaleLocked) / 2,
        y: (containerSize.height - mapH * minScaleLocked) / 2
      });
    }
  }, [mapCols, mapRows, containerSize]);

  const handleZoomFit = () => {
    if (!containerRef.current) return;
    const mapW = mapCols * GRID_SIZE;
    const mapH = mapRows * GRID_SIZE;

    const scale = Math.min(containerRef.current.clientWidth / mapW, containerRef.current.clientHeight / mapH) * 0.95;
    const minScaleLocked = Math.min(scale, 1);

    setStageScale(minScaleLocked);
    setStagePos({
      x: (containerRef.current.clientWidth - mapW * minScaleLocked) / 2,
      y: (containerRef.current.clientHeight - mapH * minScaleLocked) / 2
    });
  };

  /**
   * @Function: handleZoomToBox
   * @Description: Zoom + pan mượt (tween) để đưa 1 vùng hình chữ nhật bất kỳ
   * trên bản đồ vào giữa khung nhìn.
   * @Logic_Steps:
   * 1. Tính tỉ lệ scale theo cả 2 trục X/Y sao cho box vừa khít khung nhìn
   *    (trừ padding), lấy tỉ lệ nhỏ hơn để đảm bảo box không bị cắt.
   * 2. Giới hạn scale trong khoảng [defaultScale, 4].
   * 3. Tính toạ độ tâm box, suy ra vị trí stage mới để tâm box trùng tâm
   *    khung nhìn.
   * 4. Chạy Konva.Tween để di chuyển/scale stage mượt trong 0.5s.
   * @param boxX, boxY - toạ độ góc trên-trái của box (world coordinates)
   * @param boxW, boxH - kích thước box
   * @param padding - khoảng đệm quanh box khi zoom vào (mặc định 50px)
   */
  const handleZoomToBox = (boxX: number, boxY: number, boxW: number, boxH: number, padding: number = 50) => {
    if (!stageRef.current || !containerRef.current) return;
    const containerW = containerRef.current.clientWidth;
    const containerH = containerRef.current.clientHeight;

    const scaleX = (containerW - padding * 2) / boxW;
    const scaleY = (containerH - padding * 2) / boxH;
    let newScale = Math.min(scaleX, scaleY);
    newScale = Math.max(defaultScale, Math.min(newScale, 4));

    const centerX = boxX + boxW / 2;
    const centerY = boxY + boxH / 2;

    const newX = containerW / 2 - centerX * newScale;
    const newY = containerH / 2 - centerY * newScale;

    const tween = new Konva.Tween({
      node: stageRef.current,
      duration: 0.5,
      easing: Konva.Easings.EaseInOut,
      x: newX,
      y: newY,
      scaleX: newScale,
      scaleY: newScale,
      onFinish: () => {
        setStagePos({ x: newX, y: newY });
        setStageScale(newScale);
      }
    });
    tween.play();
  };

  /**
   * @Function: handleZoomZone
   * @Description: Zoom vào đúng 1 zone cụ thể trên bản đồ theo zoneId.
   * @Logic_Steps:
   * 1. Tìm zone đang hiển thị theo zoneId.
   * 2. Tính kích thước 1 slot theo loại xe của zone, suy ra tổng bề rộng zone
   *    theo capacity/số slot thực tế.
   * 3. Nếu zone bị xoay 90/270 độ thì hoán đổi width/height và bù trừ toạ độ
   *    góc trên-trái cho đúng hướng xoay.
   * 4. Gọi handleZoomToBox với box vừa tính, padding rộng hơn (100px).
   * @param zoneId - id của zone cần zoom tới
   */
  const handleZoomZone = (zoneId: number) => {
    const zone = visibleZones.find((z: any) => String(z.id) === String(zoneId));
    if (!zone) return;

    const { width: slotW, height: slotH } = getVehicleDimensions(zone.vehicleTypeId, vehicleTypes);

    const zoneSlots = (zone.slots && zone.slots.length > 0)
      ? zone.slots
      : slots.filter((s: any) => String(s.zoneId) === String(zone.id));

    const capacity = Math.max(zone.capacity || 0, zoneSlots.length);

    let zoneW = capacity * slotW;
    let zoneH = slotH;

    if (zone.rotation === 90 || zone.rotation === 270) {
      zoneW = slotH;
      zoneH = capacity * slotW;
    }

    let boxX = zone.layoutX || 0;
    let boxY = zone.layoutY || 0;
    if (zone.rotation === 90) boxX -= zoneW;
    else if (zone.rotation === 180) { boxX -= zoneW; boxY -= zoneH; }
    else if (zone.rotation === 270) boxY -= zoneH;

    handleZoomToBox(boxX, boxY, zoneW, zoneH, 100);
  };

  const drawGrid = () => {
    const lines = [];
    const width = mapCols * GRID_SIZE;
    const height = mapRows * GRID_SIZE;

    lines.push(<Rect key="bg" x={0} y={0} width={width} height={height} fill="#f8fafc" />);

    for (let i = 1; i < mapCols; i++) {
      lines.push(<Line key={`v-${i}`} points={[i * GRID_SIZE, 0, i * GRID_SIZE, height]} stroke="#cbd5e1" strokeWidth={1} opacity={0.3} listening={false} />);
    }
    for (let j = 1; j < mapRows; j++) {
      lines.push(<Line key={`h-${j}`} points={[0, j * GRID_SIZE, width, j * GRID_SIZE]} stroke="#cbd5e1" strokeWidth={1} opacity={0.3} listening={false} />);
    }

    lines.push(<Rect key="border" x={0} y={0} width={width} height={height} stroke="#334155" strokeWidth={4} listening={false} />);
    return lines;
  };

  return (
    <div className="flex-1 relative cursor-grab active:cursor-grabbing bg-[#f8fafc] h-full w-full rounded-xl overflow-hidden shadow-inner" ref={containerRef} style={{ minHeight: 'calc(100vh - 180px)' }}>
      {containerSize.width > 0 && containerSize.height > 0 && (
        <Stage
          width={containerSize.width}
          height={containerSize.height}
          draggable
          scaleX={stageScale}
          scaleY={stageScale}
          x={stagePos.x}
          y={stagePos.y}
          onWheel={(e) => {
            e.evt.preventDefault();
            const scaleBy = 1.05;
            const stage = e.target.getStage();
            if (!stage) return;
            const oldScale = stage.scaleX();
            const pointer = stage.getPointerPosition();
            if (!pointer) return;

            const mousePointTo = {
              x: (pointer.x - stage.x()) / oldScale,
              y: (pointer.y - stage.y()) / oldScale,
            };

            let newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
            newScale = Math.max(defaultScale, Math.min(newScale, 5));

            setStageScale(newScale);
            setStagePos({
              x: pointer.x - mousePointTo.x * newScale,
              y: pointer.y - mousePointTo.y * newScale,
            });
          }}
          ref={stageRef}
        >
          <Layer>
            {drawGrid()}
          </Layer>

          <Layer>
            {visibleZones.map((zone) => {
              const { width: slotW, height: slotH } = getVehicleDimensions(zone.vehicleTypeId, vehicleTypes);
              const zoneSlots = (zone.slots && zone.slots.length > 0)
                ? zone.slots
                : slots.filter(s => String(s.zoneId) === String(zone.id));

              const capacity = Math.max(zone.capacity || 0, zoneSlots.length);

              const zoneW = capacity * slotW;
              const zoneH = slotH;

              return (
                <Group
                  key={`zone-${zone.id}`}
                  x={zone.layoutX || 0}
                  y={zone.layoutY || 0}
                  rotation={zone.rotation || 0}
                >
                  <Rect
                    width={zoneW || (3 * GRID_SIZE)} height={zoneH || (6 * GRID_SIZE)}
                    fill="transparent"
                    stroke="#94a3b8"
                    strokeWidth={1}
                  />

                  {zoneSlots.map((slotConfig, i) => {
                    const liveSlot = slots.find(s => String(s.id) === String(slotConfig.id)) || slotConfig;
                    const xPos = i * slotW;

                    let slotFill = '#ffffff';
                    let strokeColor = '#cbd5e1';
                    let shadowColor = 'transparent';
                    if (liveSlot.status === 'OCCUPIED') {
                      slotFill = '#fee2e2';
                      strokeColor = '#ef4444';
                      shadowColor = '#ef4444';
                    } else if (liveSlot.status === 'DISABLED') {
                      slotFill = '#f1f5f9';
                    }

                    return (
                      <Group
                        key={liveSlot.id}
                        x={xPos || 0}
                        y={0}
                        onClick={(e) => {
                          e.cancelBubble = true;
                          toggleSlot(liveSlot);
                        }}
                        onTap={(e) => {
                          e.cancelBubble = true;
                          toggleSlot(liveSlot);
                        }}
                        onMouseEnter={(e) => {
                          const container = e.target.getStage().container();
                          container.style.cursor = 'pointer';
                        }}
                        onMouseLeave={(e) => {
                          const container = e.target.getStage().container();
                          container.style.cursor = 'grab';
                        }}
                      >
                        <Rect
                          width={slotW} height={slotH}
                          fill={slotFill}
                          stroke={strokeColor}
                          strokeWidth={2}
                          shadowColor={shadowColor}
                          shadowBlur={liveSlot.status === 'OCCUPIED' ? 10 : 0}
                          shadowOpacity={0.4}
                        />
                        {liveSlot.status === 'DISABLED' && (
                          <Line points={[0, 0, slotW, slotH]} stroke="#cbd5e1" strokeWidth={2} listening={false} />
                        )}

                        <KonvaText
                          x={0} y={slotH / 2 - 16}
                          width={slotW}
                          align="center"
                          text={liveSlot.slotName || liveSlot.name}
                          fontSize={16}
                          fill={liveSlot.status === 'DISABLED' ? '#94a3b8' : '#334155'}
                          fontStyle="bold"
                          listening={false}
                        />
                        {liveSlot.status === 'OCCUPIED' && liveSlot.currentPlate && (
                          <KonvaText
                            x={0} y={slotH / 2 + 4}
                            width={slotW}
                            align="center"
                            text={liveSlot.currentPlate}
                            fontSize={12}
                            fill="#ef4444"
                            fontStyle="bold"
                            listening={false}
                          />
                        )}
                      </Group>
                    );
                  })}

                  <Label x={5} y={5} listening={false}>
                    <Tag fill="rgba(255, 255, 255, 0.85)" cornerRadius={4} />
                    <KonvaText
                      text={`${zone.zoneName || zone.name}`}
                      fontSize={14}
                      fontFamily="sans-serif"
                      fill="#334155"
                      fontStyle="bold"
                      padding={4}
                    />
                  </Label>
                </Group>
              );
            })}

            {visibleGates.map((gate) => {
              let gateW = 3 * GRID_SIZE;
              let gateH = GRID_SIZE;
              if (gate.vehicleTypeId) {
                const vt = vehicleTypes.find(v => v.id === gate.vehicleTypeId);
                if (vt) gateW = (vt.matrixWidth || 3) * GRID_SIZE;
              }
              const gateColor = (gate.status === 'ACTIVE' || gate.status === 'IDLE' || gate.status === 'OCCUPIED') ? '#059669' : '#94a3b8';

              return (
                <Group
                  key={`gate-${gate.id}`}
                  x={gate.layoutX || 0}
                  y={gate.layoutY || 0}
                  rotation={gate.rotation || 0}
                >
                  <Rect
                    width={gateW || (3 * GRID_SIZE)} height={gateH || GRID_SIZE}
                    fill="#ffffff"
                    stroke={gateColor}
                    strokeWidth={3}
                    cornerRadius={4}
                    shadowColor={gateColor === '#059669' ? '#059669' : 'transparent'}
                    shadowBlur={gateColor === '#059669' ? 12 : 0}
                    shadowOpacity={0.5}
                  />
                  <KonvaText
                    x={0} y={gateH / 2 - 6}
                    width={gateW}
                    align="center"
                    text={gate.name || gate.gateName}
                    fontSize={12}
                    fontStyle="bold"
                    fill={gateColor}
                    listening={false}
                  />
                </Group>
              );
            })}
          </Layer>
        </Stage>
      )}

      {!activeFloor && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-500 bg-white">
          Chưa tải được dữ liệu tầng
        </div>
      )}
    </div>
  );
});
