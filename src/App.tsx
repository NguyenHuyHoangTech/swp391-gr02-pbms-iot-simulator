/**
 * @Author: Nguyen Huu Thanh (Member 5)
 * @Date: 2026-07-21
 * @Description: Giao diện chính của IoT Hardware Simulator - mô phỏng camera
 * LPR/RFID tại cổng vào/ra, bản đồ cảm biến zone theo thời gian thực, danh
 * sách xe đang gửi/đặt trước/vé tháng, và bộ điều khiển tua thời gian hệ
 * thống. Kết nối realtime qua WebSocket (STOMP) để đồng bộ offset thời gian
 * giả lập với backend.
 * @Dependencies:
 * - IoT hardware API (External: /api/v1/operation/iot/hardware/**, header X-API-KEY)
 * - WebSocket STOMP (/ws-pbms, topic /topic/time-sync)
 * - SimulatorMap (Local)
 * - DashboardLayout (Local)
 */
import React, { useState } from 'react';
import { Card, Typography, Row, Col, Form, Input, Button, Slider, Select, message, Table, Tag, DatePicker, ConfigProvider, theme, Radio } from 'antd';
import { SendOutlined, FastForwardOutlined, CopyOutlined, SyncOutlined, AimOutlined } from '@ant-design/icons';
import { useMutation, useQuery, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import axios from 'axios';
import dayjs from 'dayjs';

axios.defaults.headers.common['X-API-KEY'] = 'PBMS-HARDWARE-SECURE-KEY-2024';
import { Client } from '@stomp/stompjs';
import { SimulatorMap } from './SimulatorMap';
import { DashboardLayout } from './layouts/DashboardLayout';

const { Title, Text } = Typography;

const queryClient = new QueryClient();

// Mock slot list dùng tạm khi backend chưa trả dữ liệu (48 slot rỗng)
const MOCK_SLOTS = Array.from({ length: 48 }, (_, i) => ({
  id: i + 1,
  slotName: `S${i + 1}`,
  status: 'EMPTY',
  currentPlate: null
}));

/**
 * @Function: generateMockLicensePlateImage
 * @Description: Sinh ảnh camera panorama giả lập cho 1 sự kiện quét biển số.
 * @Logic_Steps:
 * 1. Random màu nền mô phỏng đường/tường theo seed từ biển số.
 * 2. Vẽ nhiễu ngẫu nhiên (các đường kẻ mờ) để tăng độ chân thực.
 * 3. Vẽ thân xe (kích thước khác nhau giữa ô tô và xe máy) và đèn hậu.
 * 4. Vẽ bảng biển số nền trắng, viền đen.
 * 5. Vẽ chữ biển số căn giữa bảng số.
 * 6. Vẽ overlay thông tin camera (timestamp, loại sự kiện, loại xe).
 * 7. Vẽ watermark crosshair mô phỏng ống kính camera.
 * @param {string} plateNumber - Biển số xe
 * @param {string} actionType - Loại sự kiện (IN/OUT)
 * @param {string} vehicleType - Loại xe
 * @returns {string} base64 JPEG data URI của ảnh giả lập
 */
const generateMockLicensePlateImage = (plateNumber: string, actionType: string, vehicleType: string) => {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  let seed = (plateNumber || 'UNKNOWN').split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  const random = () => {
    let x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
  };

  const r = Math.floor(random() * 100) + 50;
  const g = Math.floor(random() * 100) + 50;
  const b = Math.floor(random() * 100) + 50;
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < 15; i++) {
    ctx.beginPath();
    ctx.moveTo(random() * canvas.width, random() * canvas.height);
    ctx.lineTo(random() * canvas.width, random() * canvas.height);
    ctx.strokeStyle = `rgba(255,255,255,${random() * 0.2})`;
    ctx.lineWidth = random() * 10;
    ctx.stroke();
  }

  const isCar = vehicleType?.includes('4 ch') || vehicleType?.includes('7 ch') || !vehicleType;
  const carWidth = isCar ? 400 : 200;
  const carHeight = isCar ? 250 : 300;
  const carX = (canvas.width - carWidth) / 2;
  const carY = canvas.height - carHeight - 40;

  const carR = Math.floor(random() * 155) + 100;
  const carG = Math.floor(random() * 155) + 100;
  const carB = Math.floor(random() * 155) + 100;
  ctx.fillStyle = `rgb(${carR},${carG},${carB})`;

  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 20;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(carX, carY, carWidth, carHeight, 20) : ctx.fillRect(carX, carY, carWidth, carHeight);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#e74c3c';
  if (isCar) {
    ctx.fillRect(carX + 20, carY + 40, 60, 30);
    ctx.fillRect(carX + carWidth - 80, carY + 40, 60, 30);
  } else {
    ctx.fillRect(carX + carWidth / 2 - 25, carY + 40, 50, 30);
  }

  const plateWidth = 220;
  const plateHeight = 70;
  const plateX = (canvas.width - plateWidth) / 2;
  const plateY = carY + 120;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(plateX, plateY, plateWidth, plateHeight);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 4;
  ctx.strokeRect(plateX, plateY, plateWidth, plateHeight);

  ctx.fillStyle = '#000000';
  ctx.font = 'bold 38px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(plateNumber || 'NO-PLATE', plateX + plateWidth / 2, plateY + plateHeight / 2 + 5);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(0, 0, canvas.width, 40);

  ctx.fillStyle = '#2ecc71';
  ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'left';
  const timestamp = dayjs().format('YYYY-MM-DD HH:mm:ss');
  const eventText = `EVENT: ${actionType} | TYPE: ${vehicleType || 'UNKNOWN'}`;
  ctx.fillText(`CAM-01 | ${timestamp} | ${eventText}`, 10, 25);

  ctx.strokeStyle = 'rgba(46, 204, 113, 0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2, 40);
  ctx.lineTo(canvas.width / 2, canvas.height);
  ctx.moveTo(0, canvas.height / 2);
  ctx.lineTo(canvas.width, canvas.height / 2);
  ctx.stroke();

  return canvas.toDataURL('image/jpeg', 0.8);
};

/**
 * @Function: generateMockLprImage
 * @Description: Sinh ảnh crop LPR (biển số cận cảnh) giả lập, dùng cho khung
 * xem trước camera nhận diện biển số.
 * @param {string} plateNumber - Biển số xe
 * @returns {string} base64 JPEG data URI của ảnh crop biển số
 */
const generateMockLprImage = (plateNumber: string) => {
  const canvas = document.createElement('canvas');
  canvas.width = 300;
  canvas.height = 100;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 6;
  ctx.strokeRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#000000';
  ctx.font = 'bold 48px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(plateNumber || 'NO-PLATE', canvas.width / 2, canvas.height / 2 + 5);

  return canvas.toDataURL('image/jpeg', 0.9);
};

const getBaseApiUrl = () => {
  if (import.meta.env.VITE_IOT_API_URL) return import.meta.env.VITE_IOT_API_URL;
  return `http://${window.location.hostname}:8080/api/v1`;
};

const getWsUrl = () => {
  if (import.meta.env.VITE_IOT_API_URL) return import.meta.env.VITE_IOT_API_URL.replace('http', 'ws').replace('/api/v1', '/ws-pbms');
  return `ws://${window.location.hostname}:8080/ws-pbms`;
};

const App = () => {
  const [form] = Form.useForm();
  const [timeForm] = Form.useForm();
  const [activeMenu, setActiveMenu] = useState('map');
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected'>('disconnected');
  const mapRef = React.useRef<any>(null);

  React.useEffect(() => {
    const stompClient = new Client({
      brokerURL: getWsUrl(),
      onConnect: () => {
        setConnectionStatus('connected');
        stompClient.subscribe('/topic/time-sync', (message) => {
          if (message.body) {
            try {
              const data = JSON.parse(message.body);
              if (typeof data.offsetSeconds === 'number') {
                (window as any).SIMULATED_OFFSET_SECONDS = data.offsetSeconds;
              }
            } catch (e) {
              console.error("Failed to parse time-sync message", e);
            }
          }
        });
      },
      onStompError: (frame) => {
        console.error('Broker reported error: ' + frame.headers['message']);
      }
    });
    stompClient.activate();

    return () => {
      stompClient.deactivate();
    };
  }, []);

  const { data: syncData, refetch: refetchSync } = useQuery({
    queryKey: ['iot-data-sync'],
    queryFn: async () => {
      const res = await axios.get(`${getBaseApiUrl()}/operation/iot/hardware/data-sync`);
      return res.data.data;
    },
    refetchInterval: 2000
  });

  const slots = syncData?.slots || MOCK_SLOTS;
  const gates = syncData?.gates || [];
  const vehicleTypes = syncData?.vehicleTypes || [];
  const activeSessions = (syncData?.activeSessions || []).slice().sort((a: any, b: any) => new Date(b.timeIn).getTime() - new Date(a.timeIn).getTime());
  const reservations = (syncData?.reservations || []).filter((r: any) => {
    if (r.status !== 'ACTIVE' && r.status !== 'PENDING') return false;
    if (r.expectedEntryTime) {
      const duration = r.expectedDurationMinutes || 120;
      const expireTime = dayjs(r.expectedEntryTime).add(duration, 'minute');
      const now = syncData?.currentTime ? dayjs(syncData.currentTime) : dayjs();
      if (now.isAfter(expireTime)) {
        return false;
      }
    }
    return true;
  });
  const monthlyTickets = syncData?.monthlyTickets || [];
  const currentTime = syncData?.currentTime ? dayjs(syncData.currentTime).format('DD/MM/YYYY HH:mm:ss') : '--:--:--';

  const availableCards = syncData?.availableCards || [];
  const floors = syncData?.floors || [];
  const zones = syncData?.zones || [];

  const [selectedFloorId, setSelectedFloorId] = useState<number | null>(null);
  const [filterPreBookedFloor, setFilterPreBookedFloor] = useState<number | null>(null);
  const [filterPreBookedGate, setFilterPreBookedGate] = useState<number | null>(null);
  const [vehicleListType, setVehicleListType] = useState<'PREBOOKED' | 'MONTHLY'>('PREBOOKED');

  const [checkoutForm] = Form.useForm();
  const [selectedFloorIdForOut, setSelectedFloorIdForOut] = useState<number | null>(null);
  const [selectedVehicleTypeIdForOut, setSelectedVehicleTypeIdForOut] = useState<number | null>(null);
  const [selectedSessionIdForOut, setSelectedSessionIdForOut] = useState<number | null>(null);

  const selectedSession = activeSessions.find((s: any) => s.id === selectedSessionIdForOut);

  React.useEffect(() => {
    if (floors.length > 0 && selectedFloorIdForOut === null) setSelectedFloorIdForOut(floors[0].id);
    if (vehicleTypes.length > 0 && selectedVehicleTypeIdForOut === null) setSelectedVehicleTypeIdForOut(vehicleTypes[0].id);
  }, [floors, vehicleTypes, selectedFloorIdForOut, selectedVehicleTypeIdForOut]);

  React.useEffect(() => {
    if (selectedSession) {
      const typeStr = vehicleTypes.find((v: any) => v.id === selectedSession.vehicleTypeId)?.typeName || '';

      checkoutForm.setFieldsValue({
        plate: selectedSession.plate,
        rfid: selectedSession.rfidCard?.cardCode,
        vehicleType: typeStr
      });
    } else {
      checkoutForm.resetFields();
    }
  }, [selectedSessionIdForOut, selectedSession?.plate, vehicleTypes.length]);

  const currentCheckoutPlate = Form.useWatch('plate', checkoutForm);
  const currentCheckoutVehicleType = Form.useWatch('vehicleType', checkoutForm);

  const checkoutPreviewImages = React.useMemo(() => {
    if (!currentCheckoutPlate && !selectedSession) return { panorama: null, lpr: null };
    const plate = currentCheckoutPlate || selectedSession?.plate;
    const typeStr = currentCheckoutVehicleType || (selectedSession ? vehicleTypes.find((v: any) => v.id === selectedSession.vehicleTypeId)?.typeName : 'CAR');
    return {
      panorama: generateMockLicensePlateImage(plate, 'OUT', typeStr),
      lpr: generateMockLprImage(plate)
    };
  }, [currentCheckoutPlate, currentCheckoutVehicleType, selectedSession, vehicleTypes]);

  const renderInteractiveCheckoutTab = () => {
    const filteredSessions = activeSessions.filter((s: any) =>
      s.floorId === selectedFloorIdForOut &&
      s.vehicleTypeId === selectedVehicleTypeIdForOut
    );

    const availableCheckoutGates = gates.filter((g: any) =>
      g.floorId === selectedFloorIdForOut &&
      (g.gateType === 'OUT' || g.gateType === 'IN_OUT' || g.gateType === 'EXIT') &&
      (!g.vehicleTypeId || g.vehicleTypeId === selectedVehicleTypeIdForOut)
    );

    return (
      <div className="space-y-6">
        <Card className="bg-white border-gray-200 rounded-xl" title={<span className="text-blue-400 font-mono">1. Select Zone & Vehicle Type</span>}>
          <Row gutter={[16, 16]}>
            <Col xs={24} md={12}>
              <div className="mb-2 text-gray-600">Select Floor</div>
              <Select className="w-full" value={selectedFloorIdForOut} onChange={setSelectedFloorIdForOut}>
                {floors.map((f: any) => <Select.Option key={f.id} value={f.id}>{f.floorName}</Select.Option>)}
              </Select>
            </Col>
            <Col xs={24} md={12}>
              <div className="mb-2 text-gray-600">Chọn Vehicle Type</div>
              <Select className="w-full" value={selectedVehicleTypeIdForOut} onChange={setSelectedVehicleTypeIdForOut}>
                {vehicleTypes.map((v: any) => <Select.Option key={v.id} value={v.id}>{v.typeName}</Select.Option>)}
              </Select>
            </Col>
          </Row>
        </Card>

        <Card className="bg-white border-gray-200 rounded-xl" title={<span className="text-orange-400 font-mono">2. Active Vehicles (Click to select)</span>}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {filteredSessions.map((s: any) => (
              <div
                key={s.id}
                className={`p-4 border-2 rounded-xl cursor-pointer transition-all ${selectedSessionIdForOut === s.id ? 'border-blue-500 bg-blue-50 shadow-md' : 'border-gray-200 hover:border-blue-300 bg-slate-50'}`}
                onClick={() => setSelectedSessionIdForOut(s.id)}
              >
                <div className="text-center font-bold text-xl text-gray-800 tracking-widest">{s.plate}</div>
                <div className="text-center text-xs text-gray-500 mt-2">In at: {dayjs(s.timeIn).format('HH:mm DD/MM')}</div>
                <div className="text-center text-xs mt-1"><Tag color="green">{s.slot?.slotName || 'No slot'}</Tag></div>
              </div>
            ))}
            {filteredSessions.length === 0 && (
              <div className="col-span-full text-center text-gray-400 py-4">No parked vehicle matches.</div>
            )}
          </div>
        </Card>

        {selectedSession && (
          <Card className="bg-white border-blue-200 rounded-xl shadow-lg" title={<span className="text-green-500 font-mono font-bold text-lg">3. Check-Out Confirm - Plate: {selectedSession.plate}</span>}>
            <Form
              form={checkoutForm}
              layout="vertical"
              onFinish={values => {
                triggerApiMutation.mutate({
                  gateId: values.gateId,
                  actionType: 'OUT',
                  vehicleType: values.vehicleType,
                  plate: values.plate,
                  rfid: values.rfid
                });
              }}
            >
              <Row gutter={[16, 16]}>
                <Col xs={24} lg={12}>
                  <Form.Item name="gateId" label="Select Check-Out Gate" rules={[{ required: true, message: 'Please select checkout gate!' }]}>
                    <Select placeholder="-- Check-Out Gate --" size="large">
                      {availableCheckoutGates.map((g: any) => (
                        <Select.Option key={g.id} value={g.id}>{g.gateName}</Select.Option>
                      ))}
                    </Select>
                  </Form.Item>
                  <Form.Item name="plate" label="Auto-recognized Plate" rules={[{ required: true }]}>
                    <Input size="large" className="font-mono" />
                  </Form.Item>
                  <Form.Item name="rfid" label="Recovered RFID Card">
                    <Input size="large" className="font-mono" />
                  </Form.Item>
                  <Form.Item name="vehicleType" hidden><Input /></Form.Item>
                </Col>

                <Col xs={24} lg={12}>
                  <div className="flex flex-col gap-4 h-full">
                    <div className="flex-1 bg-gray-100 rounded border border-gray-300 p-2 overflow-hidden flex flex-col relative">
                      <div className="absolute top-2 left-2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded z-10">ENTRY CAMERA (DB)</div>
                      <div className="flex flex-col sm:flex-row gap-2 h-full">
                        <div className="flex-1 relative h-32 sm:h-auto">
                          {selectedSession.picInPanorama ? (
                            <img src={selectedSession.picInPanorama.startsWith('/') ? `${getBaseApiUrl().replace('/api/v1', '')}${selectedSession.picInPanorama}` : selectedSession.picInPanorama} alt="IN" className="w-full h-full object-cover rounded opacity-80" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">No image</div>
                          )}
                        </div>
                        <div className="w-full sm:w-1/3 relative bg-gray-200 rounded flex items-center justify-center p-1 h-20 sm:h-auto mt-2 sm:mt-0">
                          {selectedSession.picInFace ? (
                            <img src={selectedSession.picInFace.startsWith('/') ? `${getBaseApiUrl().replace('/api/v1', '')}${selectedSession.picInFace}` : selectedSession.picInFace} alt="LPR IN" className="w-full h-auto rounded border border-gray-400" />
                          ) : (
                            <div className="text-[10px] text-gray-400">No plate</div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 bg-blue-50 rounded border-2 border-blue-400 p-2 overflow-hidden flex flex-col relative shadow-inner">
                      <div className="absolute top-2 left-2 bg-blue-600 text-white text-[10px] px-2 py-0.5 rounded z-10 font-bold">EXIT CAMERA (MOCK LPR)</div>
                      <div className="flex flex-col sm:flex-row gap-2 h-full">
                        <div className="flex-1 relative h-32 sm:h-auto">
                          {checkoutPreviewImages.panorama && (
                            <img src={checkoutPreviewImages.panorama} alt="OUT" className="w-full h-full object-cover rounded" />
                          )}
                        </div>
                        <div className="w-full sm:w-1/3 relative bg-white border border-blue-200 rounded flex items-center justify-center p-1 shadow-sm h-20 sm:h-auto mt-2 sm:mt-0">
                          {checkoutPreviewImages.lpr && (
                            <img src={checkoutPreviewImages.lpr} alt="LPR OUT" className="w-full h-auto rounded border-2 border-blue-400" />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </Col>
              </Row>

              <div className="mt-6 flex justify-end">
                <Button size="large" type="primary" htmlType="submit" className="bg-red-500 hover:bg-red-400 border-none font-bold text-white" icon={<SendOutlined />}>
                  XÁC NHẬN & BẮN TÍN HIỆU RA (CHECK-OUT)
                </Button>
              </div>
            </Form>
          </Card>
        )}
      </div>
    );
  };

  React.useEffect(() => {
    if (floors.length > 0 && selectedFloorId === null) {
      setSelectedFloorId(floors[0].id);
    }
  }, [floors, selectedFloorId]);

  const selectedGateId = Form.useWatch('gateId', form);
  const selectedGate = gates.find((g: any) => g.id === selectedGateId);

  React.useEffect(() => {
    if (selectedGate) {
      if (selectedGate.gateType === 'IN' || selectedGate.gateType === 'ENTRY') {
        form.setFieldValue('actionType', 'IN');
      } else if (selectedGate.gateType === 'OUT' || selectedGate.gateType === 'EXIT') {
        form.setFieldValue('actionType', 'OUT');
      }
      form.setFieldValue('vehicleType', undefined);
    }
  }, [selectedGateId, selectedGate, form]);

  const currentPlate = Form.useWatch('plate', form);
  const customerType = Form.useWatch('customerType', form);
  const currentActionType = Form.useWatch('actionType', form);
  const currentVehicleType = Form.useWatch('vehicleType', form);

  const previewImages = React.useMemo(() => {
    if (!currentPlate) return { panorama: null, lpr: null };
    return {
      panorama: generateMockLicensePlateImage(currentPlate, currentActionType || 'IN', currentVehicleType || 'CAR'),
      lpr: generateMockLprImage(currentPlate)
    };
  }, [currentPlate, currentActionType, currentVehicleType]);

  const availableVehicleTypes = React.useMemo(() => {
    if (!selectedGate) return vehicleTypes;
    return vehicleTypes.filter((v: any) => {
      if (selectedGate.floorType && selectedGate.floorType !== 'ALL' && v.category !== selectedGate.floorType) {
        return false;
      }
      return true;
    });
  }, [selectedGate, vehicleTypes]);

  const handleRandomPlate = () => {
    const nums = '0123456789';
    let plate = '30A-';
    plate += nums.charAt(Math.floor(Math.random() * nums.length));
    plate += nums.charAt(Math.floor(Math.random() * nums.length));
    plate += nums.charAt(Math.floor(Math.random() * nums.length));
    plate += '.';
    plate += nums.charAt(Math.floor(Math.random() * nums.length));
    plate += nums.charAt(Math.floor(Math.random() * nums.length));
    form.setFieldValue('plate', plate);
  };

  const handleFetchRandomRFID = () => {
    if (availableCards.length > 0) {
      const randomCard = availableCards[Math.floor(Math.random() * availableCards.length)];
      form.setFieldValue('rfid', randomCard);
      message.success('Successfully got RFID: ' + randomCard);
    } else {
      message.warning('No empty RFID card in inventory!');
    }
  };

  const triggerApiMutation = useMutation({
    mutationFn: async (values: any) => {
      const gate = gates.find((g: any) => g.id === values.gateId);
      const isOut = gate?.gateType === 'OUT' || gate?.gateType === 'EXIT' || (gate?.gateType === 'IN_OUT' && values.actionType === 'OUT');
      const baseUrl = getBaseApiUrl();
      const url = isOut ? `${baseUrl}/operation/iot/hardware/gates/checkout` : `${baseUrl}/operation/iot/hardware/gates/checkin`;

      const base64Img = generateMockLicensePlateImage(values.plate, values.actionType, values.vehicleType);

      const payload = {
        gateId: values.gateId,
        plateNumber: values.plate,
        vehicleType: values.vehicleType,
        rfid: values.rfid,
        imageBase64: base64Img,
        lprImageBase64: generateMockLprImage(values.plate)
      };

      return axios.post(url, payload).then(res => res.data);
    },
    onSuccess: (_, variables) => {
      message.success(`[Gate ID ${variables.gateId}] API fired! Plate: ${variables.plate || 'N/A'}`);
      refetchSync();
    },
    onError: (error: any) => {
      message.error(error?.response?.data?.message || 'Error calling IoT API');
    }
  });

  const triggerSensorMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number, status: string }) => {
      return axios.post(`${getBaseApiUrl()}/operation/iot/hardware/sensors/update`, {
        sensorId: id,
        status: status
      }).then(res => res.data);
    },
    onSuccess: (_, variables) => {
      message.success(`Updated slot ID ${variables.id} to ${variables.status}`);
      refetchSync();
    },
    onError: () => {
      message.error('Error calling Sensor API');
    }
  });

  const timeTravelMutation = useMutation({
    mutationFn: async (values: any) => {
      const targetTimeStr = values.targetTime.format('YYYY-MM-DDTHH:mm:ss');
      return axios.post(`${getBaseApiUrl()}/operation/iot/hardware/time/fast-forward`, {
        targetTime: targetTimeStr
      }).then(res => res.data);
    },
    onSuccess: () => {
      message.success('Successfully fast-forwarded system time!');
      refetchSync();
    },
    onError: (error: any) => {
      message.error(error?.response?.data?.message || 'Error fast-forwarding time');
    }
  });

  const toggleSlot = (slot: any) => {
    const newStatus = slot.status === 'OCCUPIED' ? 'EMPTY' : 'OCCUPIED';
    triggerSensorMutation.mutate({
      id: slot.id,
      status: newStatus
    });
  };

  const copyToClipboard = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    message.info(`Copied: ${text}`);
  };

  const activeSessionsColumns = [
    { title: 'Biển số', dataIndex: 'plate', key: 'plate', render: (text: string) => <Tag color="blue">{text}</Tag> },
    { title: 'Mã Thẻ', dataIndex: ['rfidCard', 'cardId'], key: 'cardId', render: (text: string) => text ? <Tag color="cyan">{text}</Tag> : <span className="text-gray-400">N/A</span> },
    { title: 'Zone Suggest', key: 'suggestedZone', render: (_: any, record: any) => {
        let targetZoneId = record.suggestedZoneId;
        if (!targetZoneId && record.slot?.id) {
            const slotInfo = slots?.find((s: any) => s.id === record.slot.id);
            if (slotInfo) targetZoneId = slotInfo.zoneId;
        }
        if (!targetZoneId) return <span className="text-gray-400">Không có</span>;
        const zone = zones?.find((z: any) => z.id === targetZoneId);
        return zone ? <b className="text-purple-600">{zone.zoneName}</b> : <span className="text-gray-600">ID: {targetZoneId}</span>;
      }
    },
    { title: 'Time in', dataIndex: 'timeIn', key: 'timeIn', render: (text: string) => text ? dayjs(text).format('DD/MM/YYYY HH:mm:ss') : '' },
    { title: 'Loại xe', dataIndex: ['vehicleType', 'typeName'], key: 'vehicleType' },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (text: string) => <Tag color="green">{text}</Tag> },
    { title: 'Action', key: 'action', render: (_: any, record: any) => <Button icon={<CopyOutlined />} size="small" onClick={() => copyToClipboard(record.plate)}>Copy Plate</Button> }
  ];

  const reservationsColumns = [
    { title: 'Biển số', dataIndex: ['vehicle', 'plateNumber'], key: 'plate', render: (text: string) => <Tag color="orange">{text || 'Unknown'}</Tag> },
    { title: 'Zone', dataIndex: ['zone', 'zoneName'], key: 'zoneName', render: (text: string) => text || 'Không rõ' },
    { title: 'Expected Entry', dataIndex: 'expectedEntryTime', key: 'expectedEntryTime', render: (text: string) => text ? dayjs(text).format('DD/MM/YYYY HH:mm:ss') : '' },
    { title: 'Booking Fee', dataIndex: 'reservationFee', key: 'reservationFee', render: (text: number) => text ? `${text.toLocaleString()} VND` : '0 VND' },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (text: string) => <Tag color={text === 'ACTIVE' ? 'blue' : 'orange'}>{text}</Tag> },
    { title: 'Action', key: 'action', render: (_: any, record: any) => <Button icon={<CopyOutlined />} size="small" onClick={() => copyToClipboard(record.vehicle?.plateNumber)}>Copy Plate</Button> }
  ];

  const renderHardwareTab = () => {
    const filteredReservations = reservations.filter((r: any) => {
        let match = true;
        if (filterPreBookedFloor) {
            match = match && r.zone?.floorId === filterPreBookedFloor;
        }
        if (filterPreBookedGate) {
           const gate = gates.find((g: any) => g.id === filterPreBookedGate);
           if (gate) match = match && r.zone?.floorId === gate.floorId;
        }
        return match;
    });

    let allowedGates = gates.filter((g: any) => g.gateType === 'IN' || g.gateType === 'IN_OUT' || g.gateType === 'ENTRY');
    if (customerType === 'PREBOOKED' && currentPlate) {
       const res = reservations.find((r: any) => r.vehicle?.plateNumber === currentPlate && (r.status === 'ACTIVE' || r.status === 'PENDING'));
       if (res && res.zone?.floorId) {
           allowedGates = allowedGates.filter((g: any) => g.floorId === res.zone.floorId);
       }
    }

    return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={14}>
        <Card className="bg-white border-gray-200 rounded-xl" title={<span className="text-blue-400 font-mono">Camera LPR & RFID Trigger</span>}>
          <Form
            form={form}
            layout="vertical"
            onFinish={values => {
                triggerApiMutation.mutate(values);
            }}
            initialValues={{ confidence: 95, actionType: 'IN' }}
          >
            <Form.Item name="customerType" hidden><Input /></Form.Item>

            <Form.Item name="gateId" label={<span className="text-gray-600">Gate</span>} rules={[{ required: true, message: 'Please select gate' }]}>
              <Select className="bg-gray-100 text-gray-800 border-none rounded" placeholder="-- Select Gate --" size="large">
                {allowedGates.map((g: any) => (
                  <Select.Option key={g.id} value={g.id}>
                    {g.gateName || g.name} ({g.gateType || g.type})
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>

            <Row gutter={[16, 16]}>
              <Col xs={24} sm={12}>
                <Form.Item name="actionType" label={<span className="text-gray-600">Action</span>} initialValue="IN">
                  <Select
                    className="bg-gray-100 text-gray-800 border-none rounded" size="large"
                    disabled={selectedGate && (selectedGate.gateType === 'IN' || selectedGate.gateType === 'ENTRY' || selectedGate.gateType === 'OUT' || selectedGate.gateType === 'EXIT')}
                  >
                    <Select.Option value="IN"><span className="text-blue-400 font-bold">Check-In</span></Select.Option>
                    <Select.Option value="OUT"><span className="text-red-400 font-bold">Check-Out (Ra)</span></Select.Option>
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item name="vehicleType" label={<span className="text-gray-600">Vehicle Type</span>} rules={[{ required: true, message: 'Please select Vehicle Type' }]}>
                  <Select className="bg-gray-100 text-gray-800 border-none rounded" placeholder="-- Select Vehicle Type --" size="large">
                    {availableVehicleTypes.map((v: any) => (
                      <Select.Option key={v.id} value={v.typeName}>
                        {v.typeName} ({v.category === 'FOUR_WHEEL' ? 'Car' : 'Motorbike'})
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
            </Row>

            <Form.Item label={<span className="text-gray-600">License Plate</span>}>
              <div className="flex gap-2">
                <Form.Item name="plate" noStyle>
                  <Input placeholder="51G-123.45" className="bg-gray-100 text-gray-800 border-gray-300 font-mono text-lg w-full" onChange={() => form.setFieldsValue({customerType: undefined})} />
                </Form.Item>
                <Button size="large" onClick={handleRandomPlate} className="bg-gray-200 text-gray-800 border-none shrink-0" icon={<SyncOutlined />}>Random</Button>
              </div>
            </Form.Item>

            <Form.Item label={<span className="text-gray-600">RFID Card (Optional)</span>}>
              <div className="flex gap-2">
                <Form.Item name="rfid" noStyle>
                  <Input placeholder="RFID-100001" className="bg-gray-100 text-gray-800 border-gray-300 font-mono text-lg w-full" />
                </Form.Item>
                <Button size="large" onClick={handleFetchRandomRFID} className="bg-gray-200 text-gray-800 border-none shrink-0" icon={<SyncOutlined />}>Get empty card</Button>
              </div>
            </Form.Item>

            <Form.Item name="confidence" label={<span className="text-gray-600">OCR Confidence Score</span>}>
              <Slider min={0} max={100} marks={{ 0: '0%', 50: '50%', 100: '100%' }} className="mx-2" />
            </Form.Item>

            {previewImages.panorama && (
              <div className="mb-4 bg-slate-50 border-4 border-gray-200 rounded-xl overflow-hidden shadow-lg p-2 flex flex-col sm:flex-row gap-2 h-auto sm:h-48">
                <div className="flex-1 relative border-b-2 sm:border-r-2 sm:border-b-0 border-gray-200 h-32 sm:h-full">
                  <div className="absolute top-0 left-0 bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded z-10 uppercase tracking-widest">
                    Panorama Camera
                  </div>
                  <img src={previewImages.panorama} alt="Preview" className="w-full h-full object-cover opacity-90 rounded" />
                </div>
                <div className="w-full sm:w-1/3 h-24 sm:h-full relative bg-gray-50 flex flex-col items-center justify-center p-2 rounded">
                  <div className="absolute top-0 left-0 bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded z-10 uppercase tracking-widest">
                    LPR Crop
                  </div>
                  <div className="w-full aspect-[3/1] border-2 border-blue-500 rounded relative overflow-hidden shadow-[0_0_10px_rgba(59,130,246,0.5)]">
                    <img src={previewImages.lpr!} alt="LPR Preview" className="w-full h-full object-cover" />
                  </div>
                  <span className="text-gray-500 text-[9px] mt-2 font-bold tracking-widest uppercase">Mock LPR Snapshot</span>
                </div>
              </div>
            )}

            <div className="mt-4">
              <Button
                type="primary"
                htmlType="submit"
                size="large"
                icon={<SendOutlined />}
                loading={triggerApiMutation.isPending}
                className="w-full bg-blue-600 hover:bg-blue-500 border-none font-bold shadow-[0_0_15px_rgba(37,99,235,0.4)]"
              >
                FIRE EVENT (Bắn API)
              </Button>
            </div>
          </Form>
        </Card>
      </Col>

      <Col xs={24} lg={10}>
          <Card className="bg-white border-gray-200 rounded-xl h-full shadow-lg" title={
            <div className="flex justify-between items-center">
              <span className="text-purple-500 font-mono">Guest Vehicle List</span>
              <Radio.Group value={vehicleListType} onChange={e => setVehicleListType(e.target.value)} size="small" buttonStyle="solid">
                <Radio.Button value="PREBOOKED">Reserved Vehicle</Radio.Button>
                <Radio.Button value="MONTHLY">Monthly Pass Vehicle</Radio.Button>
              </Radio.Group>
            </div>
          }>
            <div className="flex flex-col gap-4">
              <div className="flex gap-2">
                <Select placeholder="Filter by Floor" allowClear className="flex-1" value={filterPreBookedFloor} onChange={setFilterPreBookedFloor}>
                  {floors.map((f: any) => <Select.Option key={f.id} value={f.id}>{f.floorName}</Select.Option>)}
                </Select>
                <Select placeholder="Filter by Gate" allowClear className="flex-1" value={filterPreBookedGate} onChange={setFilterPreBookedGate}>
                  {gates.filter((g: any) => g.gateType === 'IN' || g.gateType === 'IN_OUT' || g.gateType === 'ENTRY').map((g: any) => <Select.Option key={g.id} value={g.id}>{g.gateName}</Select.Option>)}
                </Select>
              </div>

              <div className="overflow-y-auto max-h-[600px] border border-gray-200 rounded-lg p-2 bg-slate-50">
                {vehicleListType === 'PREBOOKED' ? (
                  filteredReservations.length === 0 ? (
                    <div className="text-center text-gray-400 py-8">No matching reserved vehicle</div>
                  ) : filteredReservations.map((r: any) => (
                    <div
                      key={r.id}
                      className={`p-3 mb-2 rounded-lg border cursor-pointer transition-all ${currentPlate === r.vehicle?.plateNumber ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:border-purple-300 bg-white'}`}
                      onClick={() => {
                        let randomCard = undefined;
                        if (availableCards.length > 0) {
                          randomCard = availableCards[Math.floor(Math.random() * availableCards.length)];
                        }
                        form.setFieldsValue({
                          plate: r.vehicle?.plateNumber,
                          vehicleType: r.vehicle?.vehicleType?.typeName,
                          customerType: undefined,
                          rfid: randomCard,
                          gateId: undefined
                        });
                      }}
                    >
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-bold text-purple-700 text-lg border border-purple-200 px-2 py-0.5 rounded bg-white shadow-sm">{r.vehicle?.plateNumber}</span>
                        <span className="text-xs text-blue-500 font-bold bg-blue-100 px-2 rounded-full">{r.vehicle?.vehicleType?.typeName}</span>
                      </div>
                      <div className="text-sm text-gray-600 mb-1"><span className="font-bold">Guest:</span> {r.customer?.name || r.customer?.phone}</div>
                      <div className="text-xs text-gray-500 flex justify-between">
                        <span>Reserved zone: <b className="text-purple-600">{r.zone?.zoneName}</b></span>
                        <span>Floor: {floors.find((f: any) => f.id === r.zone?.floorId)?.floorName}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  monthlyTickets.length === 0 ? (
                    <div className="text-center text-gray-400 py-8">No monthly vehicle</div>
                  ) : monthlyTickets.map((m: any) => (
                    <div
                      key={m.id}
                      className={`p-3 mb-2 rounded-lg border cursor-pointer transition-all ${currentPlate === m.plate ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:border-purple-300 bg-white'}`}
                      onClick={() => {
                        let cardToUse = m.rfidCardId || undefined;
                        if (!cardToUse && availableCards.length > 0) {
                          cardToUse = availableCards[Math.floor(Math.random() * availableCards.length)];
                        }
                        form.setFieldsValue({
                          plate: m.plate,
                          vehicleType: m.vehicleType?.typeName,
                          customerType: undefined,
                          rfid: cardToUse,
                          gateId: undefined
                        });
                      }}
                    >
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-bold text-purple-700 text-lg border border-purple-200 px-2 py-0.5 rounded bg-white shadow-sm">{m.plate}</span>
                        <span className="text-xs text-blue-500 font-bold bg-blue-100 px-2 rounded-full">{m.vehicleType?.typeName}</span>
                      </div>
                      <div className="text-sm text-gray-600 mb-1"><span className="font-bold">Guest:</span> {m.customerName}</div>
                      <div className="text-xs text-gray-500 flex justify-between">
                        <span>Expiry: <b className="text-purple-600">{dayjs(m.validUntil).format('DD/MM/YYYY')}</b></span>
                        <span className="text-green-500 font-bold">Monthly Pass</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </Card>
        </Col>
    </Row>
    );
  };

  const renderSensorTab = () => {
    const visibleZones = zones.filter((z: any) => z.floorId === selectedFloorId);
    return (
      <Card className="bg-white border-gray-200 rounded-xl shadow-lg"
            title={
              <div className="flex justify-between items-center w-full">
                <span className="text-yellow-400 font-mono text-xl">Visual Sensor Map</span>
                <div className="flex gap-3">
                  <Button size="large" type="primary" icon={<AimOutlined />} onClick={() => mapRef.current?.handleZoomFit()} className="font-semibold shadow-sm bg-blue-600 hover:bg-blue-500">Fit to Screen</Button>
                  <Select
                    size="large"
                    placeholder="-- Zoom to Zone --"
                    options={visibleZones.map((z: any) => ({ label: z.zoneName || z.name, value: z.id }))}
                    onChange={(val) => mapRef.current?.handleZoomZone(val)}
                    allowClear
                    className="w-64 font-medium shadow-sm"
                  />
                  <Select
                    size="large"
                    className="w-64 bg-gray-100 text-gray-800 border-none rounded font-medium shadow-sm"
                    value={selectedFloorId}
                    onChange={(val) => setSelectedFloorId(val)}
                    options={floors.map((f: any) => ({ label: `${f.floorName} (${f.floorType})`, value: f.id }))}
                    placeholder="-- Select Floor --"
                  />
                </div>
              </div>
            }>

        <SimulatorMap
          ref={mapRef}
          floors={floors}
          zones={zones}
          gates={gates}
          slots={slots}
          vehicleTypes={vehicleTypes}
          selectedFloorId={selectedFloorId}
          toggleSlot={toggleSlot}
        />
      </Card>
    );
  };

  const renderDataTab = () => (
    <div className="space-y-6">
      <Card className="bg-white border-gray-200 rounded-xl" title={<span className="text-blue-400 font-mono">Active Parking Sessions</span>}>
        <div className="bg-slate-50 p-2 rounded-lg">
          <Table dataSource={activeSessions} columns={activeSessionsColumns} rowKey="id" pagination={{ pageSize: 5 }} scroll={{ x: true }} />
        </div>
      </Card>

      <Card className="bg-white border-gray-200 rounded-xl" title={<span className="text-orange-400 font-mono">Reservations</span>}>
        <div className="bg-slate-50 p-2 rounded-lg">
          <Table dataSource={reservations} columns={reservationsColumns} rowKey="id" pagination={{ pageSize: 5 }} scroll={{ x: true }} />
        </div>
      </Card>
    </div>
  );

  const renderTimeControllerTab = () => (
    <Card className="bg-white border-gray-200 rounded-xl" title={<span className="text-purple-400 font-mono">System Time Controller</span>}>
      <div className="mb-8 bg-slate-50 p-6 rounded-lg text-center border border-gray-300 shadow-inner">
        <Text className="text-gray-500 block mb-2 text-lg">Current System Virtual Time</Text>
        <Title level={1} className="!text-purple-400 m-0 font-mono tracking-widest">{currentTime}</Title>
      </div>

      <Form form={timeForm} layout="vertical" onFinish={values => timeTravelMutation.mutate(values)}>
        <Form.Item name="targetTime" label={<span className="text-gray-600 text-base">Select Fast-Forward Target</span>} rules={[{ required: true, message: 'Please select target time' }]}>
          <DatePicker
            showTime
            className="w-full"
            size="large"
            format="YYYY-MM-DD HH:mm:ss"
            showNow={false}
            renderExtraFooter={() => (
              <Button
                type="link"
                onClick={() => {
                  if (syncData?.currentTime) {
                    timeForm.setFieldsValue({ targetTime: dayjs(syncData.currentTime) });
                  }
                }}
              >
                Now (System Time)
              </Button>
            )}
          />
        </Form.Item>
        <div className="mt-8">
          <Button type="primary" htmlType="submit" size="large" icon={<FastForwardOutlined />} className="w-full bg-purple-600 hover:bg-purple-500 border-none font-bold text-lg h-12" loading={timeTravelMutation.isPending}>
            XÁC NHẬN TUA THỜI GIAN
          </Button>
        </div>
      </Form>
    </Card>
  );

  return (
    <ConfigProvider theme={{ algorithm: theme.defaultAlgorithm }}>
      <DashboardLayout
        activeKey={activeMenu}
        onMenuSelect={setActiveMenu}
        connectionStatus={connectionStatus}
      >
        {activeMenu === 'map' && <div className="animate-fade-in">{renderSensorTab()}</div>}
        {activeMenu === 'checkin' && <div className="animate-fade-in">{renderHardwareTab()}</div>}
        {activeMenu === 'checkout' && <div className="animate-fade-in">{renderInteractiveCheckoutTab()}</div>}
        {activeMenu === 'vehicles' && <div className="animate-fade-in">{renderDataTab()}</div>}
        {activeMenu === 'time' && <div className="animate-fade-in">{renderTimeControllerTab()}</div>}
      </DashboardLayout>
    </ConfigProvider>
  );
};

const RootApp = () => (
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>
);

export default RootApp;
