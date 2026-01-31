import HID from 'node-hid';

export interface DeviceInfo {
  vendorId: number;
  productId: number;
  path: string;
  product?: string;
  manufacturer?: string;
  usagePage?: number;
  usage?: number;
  interface?: number;
}

export function listDevices(): DeviceInfo[] {
  const devices = HID.devices();
  return devices.map(d => ({
    vendorId: d.vendorId,
    productId: d.productId,
    path: d.path || '',
    product: d.product,
    manufacturer: d.manufacturer,
    usagePage: d.usagePage,
    usage: d.usage,
    interface: d.interface,
  }));
}

export function findDevice(vendorId: number, productId: number): DeviceInfo | null {
  const devices = HID.devices();
  const matching = devices.filter(
    d => d.vendorId === vendorId && d.productId === productId && d.path
  );

  if (matching.length === 0) {
    return null;
  }

  // Prefer vendor-specific usage page (0xFF00+) which is accessible on macOS
  // without Input Monitoring permission. Fall back to any interface if not found.
  const vendorSpecific = matching.find(d => d.usagePage && d.usagePage >= 0xFF00);
  const device = vendorSpecific || matching[0];

  if (!device.path) {
    return null;
  }

  return {
    vendorId: device.vendorId,
    productId: device.productId,
    path: device.path,
    product: device.product,
    manufacturer: device.manufacturer,
    usagePage: device.usagePage,
    usage: device.usage,
    interface: device.interface,
  };
}
