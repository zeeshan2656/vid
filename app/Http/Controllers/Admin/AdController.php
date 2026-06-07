<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;

use App\Models\Advertisement;
use App\Services\AdService;
use Illuminate\Support\Facades\Storage;

class AdController extends Controller
{
    protected AdService $adService;

    public function __construct(AdService $adService)
    {
        $this->adService = $adService;
    }

    public function index()
    {
        $ads = Advertisement::latest()->paginate(15);
        return response()->json($ads);
    }

    public function store(Request $request)
    {
        $request->validate([
            'title' => 'required|string|max:255',
            'type' => 'required|in:banner,popup,native',
            'placement' => 'required|string|max:255',
            'target_device' => 'required|in:desktop,mobile,both',
            'image' => 'nullable|file|mimes:jpeg,png,jpg,gif,mp4,mov,avi,webm|max:20480', // 20MB limit
            'redirect_url' => 'nullable|url',
            'ad_code' => 'nullable|string',
            'status' => 'required|in:active,inactive',
            'media_type' => 'nullable|in:image,video,gif',
            'ad_duration' => 'nullable|integer|min:1',
        ]);

        $imagePath = null;
        if ($request->hasFile('image')) {
            $path = $request->file('image')->store('ads', 'public');
            $imagePath = Storage::url($path);
        }

        $ad = Advertisement::create([
            'title' => $request->title,
            'type' => $request->type,
            'placement' => $request->placement,
            'target_device' => $request->target_device,
            'image_path' => $imagePath,
            'redirect_url' => $request->redirect_url,
            'ad_code' => $request->ad_code,
            'status' => $request->status,
            'media_type' => $request->media_type ?? 'image',
            'ad_duration' => $request->ad_duration,
        ]);

        $this->adService->clearCache();

        return response()->json([
            'message' => 'Advertisement created successfully',
            'ad' => $ad
        ], 201);
    }

    public function update(Request $request, $id)
    {
        $ad = Advertisement::findOrFail($id);

        $request->validate([
            'title' => 'required|string|max:255',
            'type' => 'required|in:banner,popup,native',
            'placement' => 'required|string|max:255',
            'target_device' => 'required|in:desktop,mobile,both',
            'image' => 'nullable|file|mimes:jpeg,png,jpg,gif,mp4,mov,avi,webm|max:20480', // 20MB limit
            'redirect_url' => 'nullable|url',
            'ad_code' => 'nullable|string',
            'status' => 'required|in:active,inactive',
            'media_type' => 'nullable|in:image,video,gif',
            'ad_duration' => 'nullable|integer|min:1',
        ]);

        if ($request->hasFile('image')) {
            // Delete old image if it exists
            if ($ad->image_path) {
                $oldPath = str_replace('/storage/', '', $ad->image_path);
                Storage::disk('public')->delete($oldPath);
            }
            $path = $request->file('image')->store('ads', 'public');
            $ad->image_path = Storage::url($path);
        }

        $ad->update([
            'title' => $request->title,
            'type' => $request->type,
            'placement' => $request->placement,
            'target_device' => $request->target_device,
            'redirect_url' => $request->redirect_url,
            'ad_code' => $request->ad_code,
            'status' => $request->status,
            'media_type' => $request->media_type ?? 'image',
            'ad_duration' => $request->ad_duration,
        ]);

        $this->adService->clearCache();

        return response()->json([
            'message' => 'Advertisement updated successfully',
            'ad' => $ad
        ]);
    }

    public function destroy($id)
    {
        $ad = Advertisement::findOrFail($id);

        if ($ad->image_path) {
            $oldPath = str_replace('/storage/', '', $ad->image_path);
            Storage::disk('public')->delete($oldPath);
        }

        $ad->delete();
        $this->adService->clearCache();

        return response()->json([
            'message' => 'Advertisement deleted successfully'
        ]);
    }
}
