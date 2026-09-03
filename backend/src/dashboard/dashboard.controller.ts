import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DashboardService } from './dashboard.service';
import { QueryRevenueDto } from './dto/query-revenue.dto';
import { QueryDashboardFiltersDto } from './dto/query-dashboard-filters.dto';

@ApiTags('dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/v1/dashboard')
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  // `state` (from QueryDashboardFiltersDto, same Global Filters shape used
  // below) narrows every count/breakdown that has a real state relationship
  // (Lead directly; Quotation/SalesOrder/ProformaInvoice/TaxInvoice/JEO via
  // their Customer; Complaint via its SalesOrder's Customer). Counts with no
  // state concept at all (Products, Materials, Suppliers — company-wide
  // master data, not tied to any customer) are deliberately left unfiltered
  // even when a state is selected; see getStats()'s own comments for which
  // fields those are.
  @Get('stats')
  getStats(@Query() query: QueryDashboardFiltersDto) {
    return this.dashboardService.getStats(query.state);
  }

  // Additive: Dashboard Redesign endpoints below — all read-only reporting,
  // no existing endpoint's behavior changed.

  @Get('funnel')
  getFunnel(@Query() query: QueryDashboardFiltersDto) {
    return this.dashboardService.getFunnel(query.state);
  }

  // Revenue keeps its own period/month/year (bucketing) separate from the
  // Global Filters bar's state/executive/leadSource/productId — see
  // QueryRevenueDto's own comment on why the two aren't merged.
  @Get('revenue')
  getRevenue(@Query() query: QueryRevenueDto) {
    const { period, month, year, ...filters } = query;
    return this.dashboardService.getRevenue(period ?? 'monthly', month, year, filters);
  }

  @Get('executives')
  getExecutivePerformance(@Query() query: QueryDashboardFiltersDto) {
    return this.dashboardService.getExecutivePerformance(query);
  }

  @Get('charts')
  getCharts(@Query() query: QueryDashboardFiltersDto) {
    return this.dashboardService.getCharts(query.state);
  }

  // Additive: Dashboard Redesign v2 endpoints below.

  @Get('sales-by-state')
  getSalesByState(@Query() query: QueryDashboardFiltersDto) {
    return this.dashboardService.getSalesByState(query);
  }

  @Get('top-products')
  getTopProducts(@Query() query: QueryDashboardFiltersDto) {
    return this.dashboardService.getTopProducts(query);
  }

  @Get('recent-activities')
  getRecentActivities(@Query() query: QueryDashboardFiltersDto) {
    return this.dashboardService.getRecentActivities(20, query.state);
  }

  @Get('todays-followups')
  getTodaysFollowUps(@Query() query: QueryDashboardFiltersDto) {
    return this.dashboardService.getTodaysFollowUps(query.state);
  }
}
