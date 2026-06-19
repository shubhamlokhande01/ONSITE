export interface Employee {
  employeeId: string;
  fullName: string;
  email: string;
  phone: string;
  department: string;
  designation: string;
  joiningDate: string;
  status: "active" | "inactive";
  profileImage: string;
}

export interface Task {
  taskId: string;
  title: string;
  description: string;
  assignedTo: string; // employee uid
  assignedToName?: string;
  priority: "low" | "medium" | "high";
  dueDate: string;
  status: "pending" | "in_progress" | "completed";
  createdAt: number;
  createdBy: string;
}

export interface AttendanceRecord {
  id?: string;
  employeeId: string;
  date: string; // yyyy-mm-dd
  checkInTime?: number;
  checkOutTime?: number;
  checkInLat?: number;
  checkInLng?: number;
  checkOutLat?: number;
  checkOutLng?: number;
  selfieImage?: string;
}

export interface FieldPhoto {
  id?: string;
  employeeId: string;
  employeeName?: string;
  taskId?: string;
  url: string;
  caption: string;
  createdAt: number;
  lat?: number;
  lng?: number;
}