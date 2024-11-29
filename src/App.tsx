import React, { useEffect, useState } from "react";
import { doc, getDoc, setDoc, collection, getDocs, deleteDoc } from "firebase/firestore";
import { db } from "./Firebase/Firebase";
import "./App.css";
import * as XLSX from "xlsx"; // Importar xlsx (SheetJS)

// Tipos para la API de OpenUV
interface UVData {
  uv: number;
}
interface CommentData {
  id: string;
  uv: number;
  comment: string;
  lat: number;
  lng: number;
  timestamp: Date;
}

const defaultCoords = { lat: -27.376139, lng: -70.323444 };

const App: React.FC = () => {
  const [uvValue, setUVValue] = useState<number>(Number);
  const [uvLevel, setUVLevel] = useState<number | null>(null);
  const [uvWarning, setUVWarning] = useState<string>("");
  const [barColor, setBarColor] = useState<string>("#66cc66");
  const [barWidth, setBarWidth] = useState<string>("0%");
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [username, setUsername] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [showLogin, setShowLogin] = useState<boolean>(false); // Estado para controlar la visualización del login
  const [commentsData, setCommentsData] = useState<CommentData[]>([]);
  const [comment, setComment] = useState<string>("");
  const [lat, setLat] = useState<number>(defaultCoords.lat);
  const [lng, setLng] = useState<number>(defaultCoords.lng);
  const [isCommenting, setIsCommenting] = useState<boolean>(false);  // Nueva variable de estado

  const handleLogin = () => {
    if (username === "admin" && password === "admin") {
      setIsAdmin(true);
      alert("Credenciales correctas. ¡Bienvenido!");
    } else {
      setIsAdmin(false);
      alert("Usuario o contraseña incorrectos.");
    }
  };
  
  const deleteComment = async (commentId: string) => {
    try {
        // Crear una referencia al documento del comentario
        const commentRef = doc(db, "uvData", commentId);

        // Eliminar el comentario
        await deleteDoc(commentRef);

        // Recargar los comentarios
        fetchComments(); 
    } catch (error) {
        console.error("Error deleting comment:", error);
    }
};

  const fetchComments = async () => {
    try {
      const commentsSnapshot = await getDocs(collection(db, "uvData"));
      const commentsList: CommentData[] = [];
      commentsSnapshot.forEach((doc) => {
        const data = doc.data();
        commentsList.push({
          id: doc.id,
          uv: data.uv,
          comment: data.comment || "",
          lat: data.lat,
          lng: data.lng,
          timestamp: new Date(data.timestamp),
        });
      });
      setCommentsData(commentsList);
    } catch (error) {
      console.error("Error fetching comments:", error);
    }
  };

  useEffect(() => {
    fetchComments(); // Llamada para cargar los comentarios al inicio
  }, []);

// Función para guardar el comentario en Firestore
const saveComment = async (commentText: string, uvValue: number, lat: number, lng: number) => {
  const timestamp = new Date().getTime();
  const docRef = doc(db, "uvData", `${timestamp}`); // Utilizar timestamp o algún identificador único
  await setDoc(docRef, {
    uv: uvValue,
    comment: commentText,
    lat: lat,
    lng: lng,
    timestamp,
  });
};

// Función para manejar el envío del comentario
const handleCommentSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

  if (comment && !isCommenting) {
    setIsCommenting(true);  // Activar bloqueo para evitar registros duplicados
    await saveComment(comment, uvValue, lat, lng);  // Guardar el comentario
    setComment("");  // Limpiar el campo de comentario
    fetchComments();  // Actualizar la lista de comentarios
    setIsCommenting(false);  // Desbloquear el registro
  }
};



  
  useEffect(() => {
    // Cargar datos iniciales de UV
    fetchUVData(defaultCoords.lat, defaultCoords.lng);
    initMap();
  }, []);

  // Guardar datos en Firestore con la ID única
  const saveUVDataToFirestore = async (dataId: string, lat: number, lng: number, uv: number) => {
    const timestamp = new Date().getTime();  // Obtén el timestamp actual en milisegundos
    const dateString = new Date(timestamp).toLocaleString();  // Fecha en formato legible

    const docRef = doc(db, "uvData", dataId); // Usar dataId como referencia
    await setDoc(docRef, {
      uv,
      timestamp,
      dateString,  // Guardar la fecha en formato legible
      lat,
      lng
    });
  };

  // Recuperar datos de Firestore usando la ID única
  const getUVDataFromFirestore = async (dataId: string) => {
    const docRef = doc(db, "uvData", dataId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return docSnap.data();
    }
    return null;
  };

  const fetchUVData = async (lat: number, lng: number) => {
    const now = new Date().getTime();
    
    // Generar una ID única basada en las coordenadas y el timestamp
    const dataId = `${lat}-${lng}-${Math.floor(now / (3 * 60 * 60 * 1000))}`; // Dividir el timestamp por 3 horas para tener una actualización cada 3 horas
  
    // Verifica si las coordenadas actuales son diferentes de las anteriores
    if (lat === lat && lng === lng) {
      return; // Si las coordenadas son iguales, no hacer nada
    }
  
    try {
      // Intentar obtener los datos desde Firestore usando la ID única
      const cachedData = await getUVDataFromFirestore(dataId);
  
      if (cachedData && now - cachedData.timestamp < 3 * 60 * 60 * 1000) {  // 3 horas
        const uv = cachedData.uv;
        setUVValue(uv);
        const level = calculateUVLevel(uv);
        setUVLevel(level);
        updateUVBar(level);
        return;
      }
  
      // Si no hay datos válidos en Firestore, llama a la API
      const headers = new Headers();
      headers.append("x-access-token", "openuv-9uguimrm3ytpsys-io");
      headers.append("Content-Type", "application/json");
  
      const url = `https://api.openuv.io/api/v1/uv?lat=${lat}&lng=${lng}`;
      const response = await fetch(url, { method: "GET", headers });
  
      if (!response.ok) {
        if (response.status === 429) {
          throw new Error("Límite de solicitudes alcanzado. Intenta más tarde.");
        }
        throw new Error(`Error de la API: ${response.statusText}`);
      }
  
      const result: { result: UVData } = await response.json();
      const uv = result.result.uv;
  
      // Actualizar estados y guardar en Firestore
      setUVValue(uv);
      const level = calculateUVLevel(uv);
      setUVLevel(level);
      updateUVBar(level);
  
      // Guardar los datos con la nueva ID
      await saveUVDataToFirestore(dataId, lat, lng, uv);
  
    } catch (error) {
      console.error("Error fetching UV data:", error);
    }
  };
  

  const calculateUVLevel = (uv: number): number => {
    if (uv <= 2) return 1;
    if (uv <= 3) return 2;
    if (uv <= 4) return 3;
    if (uv <= 5) return 4;
    if (uv <= 6) return 5;
    if (uv <= 7) return 6;
    if (uv <= 8) return 7;
    if (uv <= 9) return 8;
    if (uv <= 10) return 9;
    return 10;
  };

  const updateUVBar = (level: number) => {
    const width = `${level * 10}%`;
    setBarWidth(width);

    let color = "#66cc66";
    if (level <= 3) color = "#66cc66";
    else if (level <= 6) color = "#ffcc00";
    else if (level <= 8) color = "#ff9900";
    else color = "#ff3300";

    setBarColor(color);
    setUVWarning(getUVWarning(level));
  };

  const getUVWarning = (level: number): string => {
    if (level <= 3) return "Ningún peligro para la mayoría de las personas.";
    if (level <= 5) return "Precaución: Usa gafas de sol y protector solar.";
    if (level <= 7) return "Alto: Usa protector solar obligatorio, busca la sombra.";
    if (level <= 10) return "Muy alto: Evita salir al mediodía, cúbrete.";
    return "Extremo: No salgas, busca sombra, protector solar, y usa ropa protectora.";
  };

  const initMap = () => {
    const map = new google.maps.Map(document.getElementById("map") as HTMLElement, {
      center: defaultCoords,
      zoom: 12,
    });
  
    let marker: google.maps.Marker | null = null;
  
    map.addListener("click", (event: google.maps.MapMouseEvent) => {
      const newLat = event.latLng?.lat()!;
      const newLng = event.latLng?.lng()!;
  
      setLat(newLat);  // Actualizar latitud
      setLng(newLng);  // Actualizar longitud
  
      if (marker) {
        marker.setPosition(event.latLng!);
      } else {
        marker = new google.maps.Marker({
          position: event.latLng!,
          map,
        });
      }
  
      fetchUVData(newLat, newLng);
    });
  };

  const exportToExcel = async () => {
    try {
      const uvDataSnapshot = await getDocs(collection(db, "uvData"));
      const uvDataList: any[] = [];

      uvDataSnapshot.forEach((doc) => {
        const data = doc.data();
        uvDataList.push({
          lat: data.lat,
          lng: data.lng,
          nivelDeUV: data.uv,  // Cambiar "uv" por "nivelDeUV"
          comentario: data.comment || "",  // Agregar comentario (puede estar vacío)
          timestamp: new Date(data.timestamp).toLocaleString(),  // Hora de la consulta
        });
      });

      const ws = XLSX.utils.json_to_sheet(uvDataList);

      ws["!cols"] = [
        { wpx: 100 },
        { wpx: 100 },
        { wpx: 120 },
        { wpx: 180 },
        { wpx: 150 },
      ];

      ws["A1"].v = "Latitud";
      ws["B1"].v = "Longitud";
      ws["C1"].v = "Nivel de UV";
      ws["D1"].v = "Comentario";
      ws["E1"].v = "Hora de Consulta";

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Datos UV");

      XLSX.writeFile(wb, "datos_uv.xlsx");

      alert("Datos exportados a Excel correctamente.");
    } catch (error) {
      console.error("Error exporting data to Excel:", error);
    }
  };

  return (
    <div className="app-container">
      <header>
        <h1>Radiación Solar (UV) en Tiempo Real</h1>
      </header>
      <div className="container">
        <div className="uv-info">
          <p><strong>Radiación UV:</strong> {uvValue !== null ? uvValue : "Cargando..."}</p>
          <p><strong>Ubicación:</strong> Selecciona en el mapa</p>
          <div className="uv-level">
            <p><strong>Nivel de UV:</strong> {uvLevel}</p>
            <div
              className="uv-bar"
              style={{ backgroundColor: barColor, width: barWidth }}
            />
          </div>
          <p className="warning">{uvWarning}</p>
        </div>
        <div id="map" className="map" />
      
      </div>
      <div className="admin-login-container">
      <button className="admin-button" onClick={() => setShowLogin(prev => !prev)}>
  {showLogin ? "Cerrar Admin" : "Admin"}
</button>
        </div>
        {showLogin && (
          <div className="login-modal">
            <div className="login-modal-content">
              <input
              className="input-login"
                type="text"
                placeholder="Usuario"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              <input
              className="input-login"
                type="password"
                placeholder="Contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
          <button className="login-button" onClick={handleLogin}>
            Ingresar
          </button>

              {isAdmin && <button className="excel-button" onClick={exportToExcel}>Exportar a Excel</button>}
            </div>
          </div>
        )}
        <div>
      {/* Formulario para agregar un comentario */}
      <form onSubmit={handleCommentSubmit}>
  <textarea
    id="input-comentario"
    value={comment}
    onChange={(e) => setComment(e.target.value)}
    placeholder="Agregar un comentario"
    className="textarea-comentario"
  />
  <button className="login-button" type="submit">Guardar Comentario</button>
</form>

{/* Tabla para mostrar los comentarios */}
<table className="comments-table">
  <thead>
    <tr>
      <th className="comments-table-header">ID</th>
      <th className="comments-table-header">UV</th>
      <th className="comments-table-header">Comentario</th>
      <th className="comments-table-header">Latitud</th>
      <th className="comments-table-header">Longitud</th>
      <th className="comments-table-header">Hora de Consulta</th>  {/* Nueva columna */}
      <th className="comments-table-header">*</th>
    </tr>
  </thead>
  <tbody>
    {commentsData.map((comment) => (
      <tr key={comment.id} className="comments-table-row">
        <td className="comments-table-cell">{comment.id}</td>
        <td className="comments-table-cell">{comment.uv}</td>
        <td className="comments-table-cell">{comment.comment}</td>
        <td className="comments-table-cell">{comment.lat}</td> {/* Mostrar latitud */}
        <td className="comments-table-cell">{comment.lng}</td> {/* Mostrar longitud */}
        <td className="comments-table-cell">
          {new Date(comment.timestamp).toLocaleString()} {/* Mostrar hora en formato legible */}
        </td>
        <td className="comments-table-cell"><button onClick={() => deleteComment(comment.id)}>Eliminar</button></td>
      </tr>
    ))}
  </tbody>
</table>
    </div>
    </div>
    
  );
};

export default App;
