JSON Templates for:
Using local files for audio and video library
Playlist import


This is the format if you are including both audio and video. If your do not want to include Album, or Artist, just keep the placeholde, Or you can choose a personal placeholder. 
{
  "audio": [
    {
      "name": "Title of Song",
      "artist": "Aritst of Group",
      "album": "Album Title",
      "file": "Full name of the actual file"
    }
  ],
  "video": [
    {
      "name": "Happy Days",
      "artist": "Unknown artist",
      "file": "Happy Days.mp4",
      "mediaType": "video"
    }
  ]
}


This is the format for audio only JSON


{"audio": [
    {
      "name": "Rolling In The Deep",
      "artist": "Adele",
      "album": "21",
      "file": "01 Rolling In The Deep.mp3"
    }
  ]
}



And this, video only.


  {"video": [
    {
      "name": "Happy Days",
      "artist": "Unknown artist",
      "file": "Happy Days.mp4",
      "mediaType": "video"
    }
  ]
}



JSON for playlist import

const [playlist Name] = [
  {
    name: "song Title",
    artist: "Artist or Band",
    objectKey: "relativePath/fileName",
    play: true,
  },
  {
    name: "Run Run Run",
    artist: "Sia",
    objectKey: "jMusic/Sia Run Run Run.mp3",
    play: true,
  },
]

example: 

const Ren Songs = [
  {
    name: "Blind Eyed (Live Performance)",
    artist: "Ren",
    objectKey: "Ren/Collection/Blind Eyed (Live Performance).mp3",
    play: true,
  },
  {
    name: "Chalk Outlines (Official Lyrics Video)",
    artist: "Ren",
    objectKey: "Ren/Collection/Chalk Outlines (Official Lyrics Video).mp3",
    play: true,
  },
   {
    name: "Dominos",
    artist: "Ren",
    objectKey: "Ren/Collection/Dominos.mp3",
    play: true,
  },
   {
    name: "Earned it_Mand World_Falling",
    artist: "Ren",
    objectKey: "Ren/Collection/Earned it_Mand World_Falling.mp3",
    play: true,
  }
]