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

  @Get('stats')
  getStats() {
    return this.dashboardService.getStats();
  }

  // Additive: Dashboard Redesign endpoints below — all read-only reporting,
  // no existing endpoint's behavior changed.

  @Get('funnel')
  getFunnel() {
    return this.dashboardService.getFunnel();
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
  getCharts() {
    return this.dashboardService.getCharts();
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
  getRecentActivities() {
    return this.dashboardService.getRecentActivities();
  }

  @Get('todays-followups')
  getTodaysFollowUps() {
    return this.dashboardService.getTodaysFollowUps();
  }
}
