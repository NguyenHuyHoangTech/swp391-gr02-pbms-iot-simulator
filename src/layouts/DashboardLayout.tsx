/**
 * @Author: Nguyen Huu Thanh (Member 5)
 * @Date: 2026-07-21
 * @Description: Layout khung tổng thể cho giao diện IoT Simulator. Hiển thị
 * thanh điều hướng chính (Sensor Map, Gate Check-In, Gate Check-Out, Active
 * Vehicles, Time Controller) và trạng thái kết nối realtime của hệ thống.
 * @Dependencies:
 * - antd (Layout, Menu, Typography, Space, Tag, Avatar)
 * - @ant-design/icons
 */
import React from 'react';
import { Layout, Menu, Typography, Space, Tag, Avatar } from 'antd';
import {
  AppstoreOutlined,
  VideoCameraOutlined,
  CarOutlined,
  HistoryOutlined,
  SettingOutlined,
  ApiOutlined
} from '@ant-design/icons';

const { Header, Content } = Layout;
const { Title } = Typography;

interface DashboardLayoutProps {
  children: React.ReactNode;
  activeKey: string;
  onMenuSelect: (key: string) => void;
  connectionStatus: 'connected' | 'disconnected';
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  activeKey,
  onMenuSelect,
  connectionStatus
}) => {
  const menuItems = [
    { key: 'map', icon: <AppstoreOutlined />, label: 'Sensor Map' },
    { key: 'checkin', icon: <VideoCameraOutlined />, label: 'Gate Check-In' },
    { key: 'checkout', icon: <CarOutlined />, label: 'Gate Check-Out' },
    { key: 'vehicles', icon: <HistoryOutlined />, label: 'Active Vehicles' },
    { key: 'time', icon: <SettingOutlined />, label: 'Time Controller' },
  ];

  return (
    <Layout className="min-h-screen bg-slate-50">
      <Header className="!bg-white border-b border-slate-200 px-6 flex items-center justify-between shadow-sm sticky top-0 z-10 h-16 w-full">
        <Space className="mr-2 md:mr-8 shrink-0">
          <ApiOutlined className="text-blue-600 text-2xl" />
          <Title level={4} className="!mb-0 !text-slate-800 font-bold hidden md:block">
            IoT Simulator
          </Title>
        </Space>

        <div className="flex-1 overflow-x-auto whitespace-nowrap scrollbar-hide">
          <Menu
            theme="light"
            mode="horizontal"
            selectedKeys={[activeKey]}
            items={menuItems}
            onSelect={(info) => onMenuSelect(info.key)}
            className="border-none h-16 leading-[4rem] text-sm font-medium bg-transparent"
          />
        </div>

        <Space size="middle" className="ml-2 md:ml-8 shrink-0">
          {connectionStatus === 'connected' ? (
            <Tag color="success" className="rounded-full px-3 py-1 text-xs">
              ● Connected
            </Tag>
          ) : (
            <Tag color="error" className="rounded-full px-3 py-1 text-xs">
              ● Disconnected
            </Tag>
          )}
          <div className="text-right leading-tight hidden md:block">
            <div className="text-sm font-semibold text-slate-800">System Admin</div>
            <div className="text-xs text-slate-500">Local Environment</div>
          </div>
          <Avatar className="bg-blue-600">SA</Avatar>
        </Space>
      </Header>
      <Content className="p-6 overflow-auto">
        {children}
      </Content>
    </Layout>
  );
};
