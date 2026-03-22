export interface Category {
  category_id: number;
  name: string;
  url: string;
}

export interface Subcategory {
  subcategory_id: number;
  category_id: number;
  name: string;
  url: string;
}

export interface SubcategoryTask {
  task_id: string;
  subcategory_id: number;
  category_id: number;
  subcategory: string;
  url: string;
  url_hash: string;
  current_page: number;
  last_page_completed: number;
  total_pages?: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  locked_by: string | null;
  lock_expire: number | null;
  last_updated: string;
}

export interface VehicleInfo {
  title: string;
  price: string;
  description: string;
  year: string;
  location: string;
  fuel: string;
  transmission: string;
  mileage: string;
  body_style: string;
  origin: string;
}

export interface ImageInfo {
  filename: string;
  local_path: string;
  source_url: string;
}

export interface VehicleData {
  listing_id: string;
  category_id: number;
  subcategory_id: number;
  vehicle_info: VehicleInfo;
  source_url: string;
  images: ImageInfo[];
  image_count: number;
  description_hash: string;
  crawled_at: string;
}

export interface RepairTask {
  listing_id: string;
  reason: string;
}

export interface IntegrityReport {
  total_vehicles: number;
  valid_vehicles: number;
  corrupted_vehicles: number;
  missing_images: number;
  missing_json: number;
  mismatched_image_count: number;
  empty_folders: number;
  invalid_images: number;
  missing_ids: number;
}
