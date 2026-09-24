import { Module } from '@nestjs/common';
import { PlacesService } from './places.service';
import { PlacesController } from './places.controller';

// Google Places Autocomplete (New) proxy — see PlacesService for the
// "Future Ready" (works unconfigured, upgrades automatically once
// GOOGLE_PLACES_API_KEY is set) convention this follows.
@Module({
  controllers: [PlacesController],
  providers: [PlacesService],
})
export class PlacesModule {}
