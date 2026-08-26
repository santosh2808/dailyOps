import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Toaster from "@/components/ui/toaster";
import Login from "@/pages/Login";
import ChangePassword from "@/pages/ChangePassword";
import Dashboard from "@/pages/Dashboard";
import Customers from "@/pages/Customers";
import CustomerDetails from "@/pages/CustomerDetails";
import Products from "@/pages/Products";
import LeadList from "@/pages/LeadList";
import LeadForm from "@/pages/LeadForm";
import LeadDetails from "@/pages/LeadDetails";
import QuotationList from "@/pages/QuotationList";
import QuotationForm from "@/pages/QuotationForm";
import QuotationDetails from "@/pages/QuotationDetails";
import QuotationApprovals from "@/pages/QuotationApprovals";
import EmailTemplates from "@/pages/EmailTemplates";
import SalesOrderList from "@/pages/SalesOrderList";
import SalesOrderForm from "@/pages/SalesOrderForm";
import SalesOrderDetails from "@/pages/SalesOrderDetails";
import ProformaInvoiceList from "@/pages/ProformaInvoiceList";
import ProformaInvoiceDetails from "@/pages/ProformaInvoiceDetails";
import JobExecutionOrderList from "@/pages/JobExecutionOrderList";
import JobExecutionOrderDetails from "@/pages/JobExecutionOrderDetails";
import ProductionDashboard from "@/pages/ProductionDashboard";
import MaterialList from "@/pages/MaterialList";
import MaterialForm from "@/pages/MaterialForm";
import MaterialDetails from "@/pages/MaterialDetails";
import SupplierList from "@/pages/SupplierList";
import SupplierForm from "@/pages/SupplierForm";
import SupplierDetails from "@/pages/SupplierDetails";
import ComplaintList from "@/pages/ComplaintList";
import ComplaintForm from "@/pages/ComplaintForm";
import ComplaintDetails from "@/pages/ComplaintDetails";
import Users from "@/pages/Users";
import Roles from "@/pages/Roles";
import Permissions from "@/pages/Permissions";
import Departments from "@/pages/Departments";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/change-password"
            element={
              <ProtectedRoute>
                <ChangePassword />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/customers"
            element={
              <ProtectedRoute>
                <Customers />
              </ProtectedRoute>
            }
          />
          <Route
            path="/customers/:id"
            element={
              <ProtectedRoute>
                <CustomerDetails />
              </ProtectedRoute>
            }
          />
          <Route
            path="/products"
            element={
              <ProtectedRoute>
                <Products />
              </ProtectedRoute>
            }
          />
          <Route
            path="/leads"
            element={
              <ProtectedRoute>
                <LeadList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/leads/new"
            element={
              <ProtectedRoute>
                <LeadForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/leads/:id/edit"
            element={
              <ProtectedRoute>
                <LeadForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/leads/:id"
            element={
              <ProtectedRoute>
                <LeadDetails />
              </ProtectedRoute>
            }
          />
          <Route
            path="/quotations"
            element={
              <ProtectedRoute>
                <QuotationList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/quotations/new"
            element={
              <ProtectedRoute>
                <QuotationForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/quotations/:id/edit"
            element={
              <ProtectedRoute>
                <QuotationForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/quotations/:id"
            element={
              <ProtectedRoute>
                <QuotationDetails />
              </ProtectedRoute>
            }
          />
          <Route
            path="/quotations/approvals"
            element={
              <ProtectedRoute>
                <QuotationApprovals />
              </ProtectedRoute>
            }
          />
          <Route
            path="/email-templates"
            element={
              <ProtectedRoute>
                <EmailTemplates />
              </ProtectedRoute>
            }
          />
          <Route
            path="/sales-orders"
            element={
              <ProtectedRoute>
                <SalesOrderList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/sales-orders/new"
            element={
              <ProtectedRoute>
                <SalesOrderForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/sales-orders/:id/edit"
            element={
              <ProtectedRoute>
                <SalesOrderForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/sales-orders/:id"
            element={
              <ProtectedRoute>
                <SalesOrderDetails />
              </ProtectedRoute>
            }
          />
          <Route
            path="/proforma-invoices"
            element={
              <ProtectedRoute>
                <ProformaInvoiceList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/proforma-invoices/:id"
            element={
              <ProtectedRoute>
                <ProformaInvoiceDetails />
              </ProtectedRoute>
            }
          />
          <Route
            path="/production-dashboard"
            element={
              <ProtectedRoute>
                <ProductionDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/job-execution-orders"
            element={
              <ProtectedRoute>
                <JobExecutionOrderList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/job-execution-orders/:id"
            element={
              <ProtectedRoute>
                <JobExecutionOrderDetails />
              </ProtectedRoute>
            }
          />
          <Route
            path="/materials"
            element={
              <ProtectedRoute>
                <MaterialList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/materials/new"
            element={
              <ProtectedRoute>
                <MaterialForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/materials/:id/edit"
            element={
              <ProtectedRoute>
                <MaterialForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/materials/:id"
            element={
              <ProtectedRoute>
                <MaterialDetails />
              </ProtectedRoute>
            }
          />
          <Route
            path="/suppliers"
            element={
              <ProtectedRoute>
                <SupplierList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/suppliers/new"
            element={
              <ProtectedRoute>
                <SupplierForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/suppliers/:id/edit"
            element={
              <ProtectedRoute>
                <SupplierForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/suppliers/:id"
            element={
              <ProtectedRoute>
                <SupplierDetails />
              </ProtectedRoute>
            }
          />
          <Route
            path="/complaints"
            element={
              <ProtectedRoute>
                <ComplaintList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/complaints/new"
            element={
              <ProtectedRoute>
                <ComplaintForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/complaints/:id/edit"
            element={
              <ProtectedRoute>
                <ComplaintForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/complaints/:id"
            element={
              <ProtectedRoute>
                <ComplaintDetails />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <ProtectedRoute>
                <Users />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/roles"
            element={
              <ProtectedRoute>
                <Roles />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/permissions"
            element={
              <ProtectedRoute>
                <Permissions />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/departments"
            element={
              <ProtectedRoute>
                <Departments />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
      <Toaster />
    </BrowserRouter>
  );
}
