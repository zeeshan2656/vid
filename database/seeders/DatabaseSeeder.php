<?php

namespace Database\Seeders;

use App\Models\User;
use App\Models\Setting;
use Illuminate\Support\Facades\Hash;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // Seed admin user
        User::updateOrCreate(
            ['email' => 'admin@platform.com'],
            [
                'name' => 'Administrator',
                'password' => Hash::make('admin12345'),
            ]
        );

        // Seed default settings
        Setting::updateOrCreate(['key' => 'site_name'], ['value' => 'FreeHub Live']);
        Setting::updateOrCreate(['key' => 'site_description'], ['value' => 'Ultra-Fast Video and Reels Sharing Platform']);
        Setting::updateOrCreate(['key' => 'logo_text'], ['value' => 'FREEHUB']);
    }
}
